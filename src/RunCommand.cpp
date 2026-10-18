#include "S2.h"

#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <limits>
#include <memory>
#include <set>
#include <string>

namespace
{
	class Runner : public S2::OptionsVisitor
	{
	public:
		Runner(const S2::Options &options, S2::Devices &devices, S2::StreamFactory &streamFactory)
			: options(options), devices(devices), streamFactory(streamFactory), outputSafety(devices),
			  generator(options.generator), channel(options.channel)
		{
		}

		void Run(S2::ProgressMonitor &progress)
		{
			const double sequenceDuration = scheduler.Duration();
			if (!std::isfinite(sequenceDuration) || sequenceDuration <= 0.0)
				throw S2::IOError("No runnable program was supplied, or its duration is invalid");

			for (std::set<S2::ChannelId>::const_iterator channel = scheduledChannels.begin();
				channel != scheduledChannels.end(); ++channel)
			{
				if (openedGenerators.insert(channel->first).second)
					devices.GetGenerator(channel->first).Open(devices, streamFactory);
				outputSafety.EnsureOff(channel->first, channel->second);
			}

			const double totalDuration = options.loop
				? std::numeric_limits<double>::infinity()
				: sequenceDuration * options.iterations;
			progress.TotalRunTime(totalDuration);

			int completedIterations = 0;
			while (!S2::IsInterrupted() && (options.loop || completedIterations < options.iterations))
			{
				scheduler.Begin();
				const std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
				S2::ChannelState state;

				while (!S2::IsInterrupted() && scheduler.Next(state, 1.0, false))
				{
					const double targetTime = options.simulation ? state.time / 100.0 : state.time;
					while (!S2::IsInterrupted())
					{
						const double elapsed = std::chrono::duration<double>(
							std::chrono::steady_clock::now() - start).count();
					const double wait = targetTime - elapsed;
					if (wait <= 0.0)
						break;
					S2::Sleep(wait < 0.1 ? wait : 0.1);
				}

					if (S2::IsInterrupted())
						break;
					ApplyState(state, progress);
				}

				if (!options.loop)
					++completedIterations;
			}

			outputSafety.DisableAll();
		}

		void Duration(double)
		{
			throw S2::IOError("duration= is not supported by run; program steps define their own durations");
		}

		void Generator(int id)
		{
			generator = id;
		}

		void Channel(int id)
		{
			channel = id;
		}

		void Preset(const char *filename)
		{
			std::ifstream presetFile(filename);
			if (!presetFile)
				throw S2::IOError(std::string("Failed to load preset: ") + filename);
			Add(std::make_shared<S2::Preset>(options, presetFile));
		}

		class ProgramId : public S2::DatabaseVisitor
		{
		public:
			explicit ProgramId(int requestedId) : requestedId(requestedId) {}

			void DatabaseRow(int row, const std::string &line)
			{
				if (row == requestedId)
					this->line = line;
			}

			std::string line;

		private:
			int requestedId;
		};

		void Program(int id)
		{
			std::cout << "Queuing database program " << id << std::endl;
			ProgramId selected(id);
			database.VisitDataFiles(options, selected);
			if (selected.line.empty())
				throw S2::ValueOutOfRange("Program not found in local programs.csv");
			std::shared_ptr<S2::DatabaseProgram> program;
			try
			{
				program = std::make_shared<S2::DatabaseProgram>(options, selected.line);
				const double duration = program->Duration();
				if (!std::isfinite(duration) || duration <= 0.0)
					throw S2::IOError("Program duration must be finite and positive");
			}
			catch (const std::exception &error)
			{
				throw S2::IOError(options.DataFile("programs.csv") + ":" + std::to_string(id) + ": " + error.what());
			}
			Add(program);
		}

		void Code(const char *code)
		{
			Add(std::make_shared<S2::Program>(options, code));
		}

		void Amplitude(double)
		{
			// The final amplitude setpoint is already held in Options and is used
			// when a program step does not specify its own A value.
		}

		void Frequency(double)
		{
			throw S2::IOError("frequency= is not supported by run; program code defines frequency");
		}

		void Output(bool)
		{
			throw S2::IOError("output= is not supported by run; program state controls output");
		}

		void Waveform(S2::BuiltinWaveform)
		{
			throw S2::IOError("waveform= is not implemented by run");
		}

		void Waveform(const S2::WaveData &)
		{
			throw S2::IOError("custom waveform= is not implemented by run");
		}

		void Pulse(int)
		{
			throw S2::IOError("pulse= is not applicable to run");
		}

		void Send(const char *)
		{
			throw S2::IOError("raw send= is not supported by run");
		}

		void Offset(double)
		{
			throw S2::IOError("offset= is not implemented by run");
		}

		void Phase(int)
		{
			throw S2::IOError("phase= is not implemented by run");
		}

		void Sync(bool)
		{
			throw S2::IOError("sync= is controlled by channel selection and is not a run option");
		}

		void Duty(double)
		{
			throw S2::IOError("duty= is not implemented by run");
		}

		void Name(const char *)
		{
			throw S2::IOError("name= is supported by find, not run");
		}

		void Shutdown()
		{
			outputSafety.DisableAll();
		}

	private:
		void Add(const std::shared_ptr<S2::Sequence> &sequence)
		{
			const S2::ChannelId channelId(generator, channel);
			scheduler.Add(channelId, sequence);
			scheduledChannels.insert(channelId);
		}

		void ApplyState(const S2::ChannelState &state, S2::ProgressMonitor &progress)
		{
			if (!state.output)
			{
				outputSafety.SetOutput(state.channelId.first, state.channelId.second, false);
				progress.GeneratorState(state.time, state.channelId, 0.0, 0.0, state.waveform);
				return;
			}

			S2::Channel &output = devices.GetGenerator(state.channelId.first).GetChannel(state.channelId.second);
			double amplitude = state.amplitude;
			if (std::isnan(amplitude))
				amplitude = options.amplitude;
			if (!std::isfinite(amplitude) || amplitude < 0.0 || amplitude > 40.0)
				throw S2::IOError("Program amplitude is outside the supported 0-40 V setpoint range");

			if (!std::isnan(state.frequency))
				output.Frequency(state.frequency);
			output.Amplitude(amplitude);
			outputSafety.SetOutput(state.channelId.first, state.channelId.second, true);
			progress.GeneratorState(state.time, state.channelId, amplitude, state.frequency, state.waveform);
		}

		const S2::Options &options;
		S2::Devices &devices;
		S2::StreamFactory &streamFactory;
		S2::OutputSafetyGuard outputSafety;
		S2::MultiChannelSequence scheduler;
		S2::Database database;
		int generator;
		int channel;
		std::set<S2::ChannelId> scheduledChannels;
		std::set<int> openedGenerators;
	};
}

int S2::Run(const Options &options, ProgressMonitor &progress, StreamFactory &streamFactory)
{
	try
	{
		Devices devices(options);
		Runner runner(options, devices, streamFactory);
		options.Visit(runner);
		runner.Run(progress);
		runner.Shutdown();
	}
	catch (...)
	{
		progress.HandleException();
		return 1;
	}

	return 0;
}
