#include "S2.h"

#include <iostream>
#include <set>
#include <string>

namespace
{
	class Controller : public S2::OptionsVisitor
	{
	public:
		Controller(const S2::Options &options, S2::ProgressMonitor &pm, S2::StreamFactory &streamFactory)
		: pm(pm), streamFactory(streamFactory), devices(options), outputSafety(devices),
		  generator(options.generator), channel(options.channel)
		{
		}

		void Duration(double seconds)
		{
			std::cout << "Pausing for " << seconds << " seconds\n";
			S2::Sleep(seconds);
			if (S2::IsInterrupted())
				throw S2::Interrupted();
		}

		void UnrecognisedOption(const char *option)
		{
			throw S2::InvalidCommandLineArgument(option);
		}

		void Generator(int id)
		{
			generator = id;
		}

		void Pulse(int)
		{
			throw S2::IOError("pulse= is only applicable to pulse and scan commands");
		}

		void Channel(int id)
		{
			channel = id;
		}

		void Waveform(S2::BuiltinWaveform waveform)
		{
			const char *name = "unknown";
			switch (waveform)
			{
			case S2::BuiltinWaveform::sine: name = "sine"; break;
			case S2::BuiltinWaveform::square: name = "square"; break;
			case S2::BuiltinWaveform::sawtooth: name = "sawtooth"; break;
			case S2::BuiltinWaveform::custom: name = "custom"; break;
			case S2::BuiltinWaveform::unknown: break;
			}
			std::cout << "Setting generator " << generator << " channel " << channel
				<< " waveform to " << name << "\n";
			GetChannel().Waveform(waveform);
		}

		void Waveform(const S2::WaveData &data)
		{
			std::cout << "Setting generator " << generator << " channel " << channel
				<< " to a custom waveform\n";
			GetChannel().Waveform(data);
		}

		void Amplitude(double amplitude)
		{
			std::cout << "Setting generator " << generator << " channel " << channel
				<< " amplitude setpoint to " << amplitude << " V\n";
			GetChannel().Amplitude(amplitude);
		}

		void Frequency(double frequency)
		{
			std::cout << "Setting generator " << generator << " channel " << channel
				<< " frequency setpoint to " << frequency << " Hz\n";
			GetChannel().Frequency(frequency);
		}

		void Output(bool on)
		{
			OpenGenerator(generator);
			outputSafety.EnsureOff(generator, channel);
			outputSafety.SetOutput(generator, channel, on);
		}

		void Send(const char *)
		{
			throw S2::IOError("raw send= is disabled because its output state cannot be tracked safely");
		}

		void Lock(bool)
		{
			throw S2::IOError("The lock option is not implemented");
		}

		void Offset(double offset)
		{
			std::cout << "Setting generator " << generator << " channel " << channel
				<< " offset to " << offset << "\n";
			GetChannel().Offset(offset);
		}

		void Phase(int)
		{
			throw S2::IOError("The phase option is not implemented in control mode");
		}

		void Sync(bool)
		{
			throw S2::IOError("The sync option is controlled by channel selection in this build");
		}

		void Duty(double duty)
		{
			std::cout << "Setting generator " << generator << " channel " << channel
				<< " duty setpoint to " << duty << "\n";
			GetChannel().Duty(duty);
		}

		void Preset(const char *)
		{
			throw S2::IOError("preset= is supported by run, not control");
		}

		void Simulation(bool) {}

		void Name(const char *)
		{
			throw S2::IOError("name= is supported by find, not control");
		}

		void Program(int)
		{
			throw S2::IOError("program= is supported by run, not control");
		}

		void Code(const char *)
		{
			throw S2::IOError("code= is supported by run, not control");
		}

		void Shutdown()
		{
			outputSafety.DisableAll();
		}

	private:
		void OpenGenerator(int id)
		{
			if (openedGenerators.insert(id).second)
				devices.GetGenerator(id).Open(devices, streamFactory);
		}

		S2::Channel &GetChannel()
		{
			OpenGenerator(generator);
			outputSafety.EnsureOff(generator, channel);
			return devices.GetGenerator(generator).GetChannel(channel);
		}

		S2::ProgressMonitor &pm;
		S2::StreamFactory &streamFactory;
		S2::Devices devices;
		S2::OutputSafetyGuard outputSafety;
		int generator;
		int channel;
		std::set<int> openedGenerators;
	};
}

int S2::Control(const Options &options, ProgressMonitor &pm, StreamFactory &streamFactory)
{
	try
	{
		Controller controller(options, pm, streamFactory);
		options.Visit(controller);
		controller.Shutdown();
		return 0;
	}
	catch (const DeviceNotFound &)
	{
		std::cerr << "Could not open generator " << options.generator << std::endl;
		return 1;
	}
	catch (const IOError &error)
	{
		std::cerr << "Generator operation failed: " << error.what() << std::endl;
		return 1;
	}
}
