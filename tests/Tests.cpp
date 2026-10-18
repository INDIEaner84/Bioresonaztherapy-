#include "Tests.h"

#include <algorithm>
#include <cmath>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <type_traits>

static_assert(std::has_virtual_destructor<S2::Sequence>::value,
	"Sequence must be safely destructible through its base interface");

#ifdef _WIN32
#include <windows.h>
#else
#include "Posix.h"
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace
{
	std::string MakeTestDataDirectory()
	{
#ifdef _WIN32
		char temporaryPath[MAX_PATH];
		const DWORD length = GetTempPathA(MAX_PATH, temporaryPath);
		assert(length > 0 && length < MAX_PATH);
		const std::string base = std::string(temporaryPath) + "s2-tests-" +
			std::to_string(static_cast<unsigned long>(GetCurrentProcessId()));
		CreateDirectoryA(base.c_str(), nullptr);
		CreateDirectoryA((base + "\\.s2").c_str(), nullptr);
		assert(_putenv_s("APPDATA", base.c_str()) == 0);
		return base;
#else
		const std::string base = std::string("/tmp/s2-tests-") + std::to_string(static_cast<long>(getpid()));
		mkdir(base.c_str(), 0700);
		assert(setenv("HOME", base.c_str(), 1) == 0);
		return base;
#endif
	}

	std::size_t CountOccurrences(const std::string &text, const std::string &pattern)
	{
		std::size_t count = 0;
		std::string::size_type position = 0;
		while ((position = text.find(pattern, position)) != std::string::npos)
		{
			++count;
			position += pattern.size();
		}
		return count;
	}
}

void setupTestEnvironment()
{
	const std::string base = MakeTestDataDirectory();
#ifdef _WIN32
	std::remove((base + "\\.s2\\settings.txt").c_str());
#else
	mkdir((base + "/.s2").c_str(), 0700);
	std::remove((base + "/.s2/settings.txt").c_str());
#endif
}

TestStreamFactory::TestStreamFactory()
	: pulse(std::make_shared<TestPulse>()), generator(std::make_shared<TestGenerator>()), generatorOpenCount(0)
{
}

std::shared_ptr<S2::Stream> TestStreamFactory::Open(S2::Devices &, S2::Pulse &)
{
	return pulse;
}

std::shared_ptr<S2::Stream> TestStreamFactory::Open(S2::Devices &, S2::Generator &)
{
	++generatorOpenCount;
	return generator;
}

TestGenerator::TestGenerator()
	: responseOffset(0), maxWriteChunk(0), maxReadChunk(0),
	  failedOffAcknowledgements(0), failEnableAcknowledgement(false)
{
}

int TestGenerator::Read(char *buffer, int size)
{
	if (size <= 0 || responseOffset >= response.size())
		return 0;

	std::size_t count = std::min(static_cast<std::size_t>(size), response.size() - responseOffset);
	if (maxReadChunk > 0)
		count = std::min(count, static_cast<std::size_t>(maxReadChunk));
	std::memcpy(buffer, response.data() + responseOffset, count);
	responseOffset += count;
	return static_cast<int>(count);
}

int TestGenerator::Write(const char *buffer, int size)
{
	if (size <= 0)
		return 0;

	int count = size;
	if (maxWriteChunk > 0)
		count = std::min(count, maxWriteChunk);
	input.write(buffer, count);
	pendingCommand.append(buffer, static_cast<std::size_t>(count));
	if (pendingCommand.find('\n') != std::string::npos)
	{
		lastCommand = pendingCommand;
		pendingCommand.clear();
		response = "ok\r\n";
		if (lastCommand == ":w610\r\n" && failedOffAcknowledgements > 0)
		{
			--failedOffAcknowledgements;
			response = "er\r\n";
		}
		else if (lastCommand == ":w611\r\n" && failEnableAcknowledgement)
		{
			failEnableAcknowledgement = false;
			response = "er\r\n";
		}
		responseOffset = 0;
	}
	return count;
}

TestPulse::TestPulse()
	: readResult(0), interval(0), nextIntervalSample(0), readCount(0), interruptAfterReads(0)
{
}

int TestPulse::Read(char *buffer, int size)
{
	if (readResult != 65)
		return readResult;
	if (size < 65)
		return 0;

	if (nextIntervalSample < intervalSamples.size())
		interval = intervalSamples[nextIntervalSample];
	++nextIntervalSample;

	std::memset(buffer, 0, 65);
	unsigned char *report = reinterpret_cast<unsigned char *>(buffer);
	report[3] = static_cast<unsigned char>((interval >> 16) & 0xff);
	report[4] = static_cast<unsigned char>((interval >> 8) & 0xff);
	report[5] = static_cast<unsigned char>(interval & 0xff);
	++readCount;
	if (interruptAfterReads > 0 && readCount == interruptAfterReads)
		std::raise(SIGINT);
	return 65;
}

int TestPulse::Write(const char *, int)
{
	return 0;
}

void testGenerator()
{
	const char *args[] = { "s2", "control", "simulation=on" };
	S2::Options options(3, args);
	S2::Devices devices(options);
	TestStreamFactory streamFactory;
	S2::Generator generator(1, "");
	generator.Open(devices, streamFactory);
	generator.GetChannel(1).Output(false);
	assert(streamFactory.generator->input.str() == ":w680\r\n:w610\r\n");

	S2::Generator synchronized(2, "");
	synchronized.Open(devices, streamFactory);
	assert_throws<S2::IOError>([&] { synchronized.GetChannel(0).Offset(0.0); });
	assert(streamFactory.generator->input.str().find(":w621\r\n") == std::string::npos);
}

void testGeneratorPartialIo()
{
	const char *args[] = { "s2", "control", "simulation=on" };
	S2::Options options(3, args);
	S2::Devices devices(options);
	TestStreamFactory streamFactory;
	streamFactory.generator->maxWriteChunk = 2;
	streamFactory.generator->maxReadChunk = 1;

	S2::Generator generator(1, "");
	generator.Open(devices, streamFactory);
	generator.GetChannel(1).Amplitude(5.0);

	// The adapter must assemble the full command and the generator must accept
	// an ACK arriving one byte at a time.
	assert(streamFactory.generator->input.str() == ":w680\r\n:w25500\r\n");
	assert(streamFactory.generator->pendingCommand.empty());
}

#ifndef _WIN32
void testPosixDrainFailure()
{
	int pipeDescriptors[2];
	assert(pipe(pipeDescriptors) == 0);

	S2::PosixStream output(pipeDescriptors[1]);
	const char byte = 'x';

	// The pipe write succeeds, but tcdrain must reject a non-terminal fd. The
	// adapter must surface that failure instead of reporting full success.
	assert(output.Write(&byte, 1) == -1);
	char received = '\0';
	assert(read(pipeDescriptors[0], &received, 1) == 1);
	assert(received == byte);
	assert(close(pipeDescriptors[0]) == 0);
}
#endif

#ifdef __linux__
void testLinuxHidReadFailure()
{
	const char *args[] = { "s2", "control", "simulation=on" };
	S2::Options options(3, args);
	S2::Devices devices(options);
	S2::Pulse pulse(1, "."); // Opening a directory works; reading it fails with EISDIR.
	S2::DefaultStreamFactory streamFactory;
	std::shared_ptr<S2::Stream> stream = streamFactory.Open(devices, pulse);
	char buffer[65] = {};
	assert(stream->Read(buffer, sizeof(buffer)) == -1);
}
#endif

void testPulse()
{
	const char *args[] = { "s2", "control", "simulation=on" };
	S2::Options options(3, args);
	S2::Devices devices(options);
	TestStreamFactory streamFactory;
	S2::Pulse pulse(1, "");
	pulse.Open(devices, streamFactory);
	assert_throws<S2::IOError>([&] { pulse.BPM(); });

	streamFactory.pulse->readResult = 65;
	streamFactory.pulse->interval = 250000;
	assert(pulse.BPM() == 60.0);
	streamFactory.pulse->interval = 0;
	assert_throws<S2::IOError>([&] { pulse.BPM(); });
}

void testScanFiniteIterations()
{
	const char *args[] = { "s2", "scan", "simulation=on", "iterations=3" };
	S2::Options options(4, args);
	std::stringstream progressOutput;
	S2::DefaultProgressMonitor progress(S2::Quiet, progressOutput);
	TestStreamFactory streamFactory;
	streamFactory.pulse->readResult = 65;
	streamFactory.pulse->intervalSamples.push_back(250000); // 60 bpm
	streamFactory.pulse->intervalSamples.push_back(260000); // approximately 57.7 bpm: stable
	streamFactory.pulse->intervalSamples.push_back(230769); // approximately 65 bpm: rising
	streamFactory.pulse->intervalSamples.push_back(272727); // approximately 55 bpm: large change

	std::ostringstream display;
	std::streambuf *previousOutput = std::cout.rdbuf(display.rdbuf());
	const int result = S2::Scan(options, progress, streamFactory);
	std::cout.rdbuf(previousOutput);

	assert(result == 0);
	assert(display.str() == "-<X\n");
	assert(streamFactory.pulse->readCount == 4);
	assert(streamFactory.generator->input.str().empty());
}

void testScanLoopInterrupt()
{
	const char *args[] = { "s2", "scan", "simulation=on", "loop=on" };
	S2::Options options(4, args);
	std::stringstream progressOutput;
	S2::DefaultProgressMonitor progress(S2::Quiet, progressOutput);
	TestStreamFactory streamFactory;
	streamFactory.pulse->readResult = 65;
	streamFactory.pulse->intervalSamples.push_back(250000);
	streamFactory.pulse->intervalSamples.push_back(230769);
	streamFactory.pulse->intervalSamples.push_back(250000);
	streamFactory.pulse->intervalSamples.push_back(230769);
	streamFactory.pulse->interruptAfterReads = 4;

	std::ostringstream display;
	int result = 0;
	{
		S2::InterruptScope interruptScope;
		std::streambuf *previousOutput = std::cout.rdbuf(display.rdbuf());
		result = S2::Scan(options, progress, streamFactory);
		std::cout.rdbuf(previousOutput);
	}
	assert(result == 130);
	assert(display.str() == "<><\n");
	assert(streamFactory.pulse->readCount == 4);

	// InterruptScope deliberately leaves the observed interrupt flag set. Reset
	// it so the rest of this unit-test process can continue normally.
	{
		S2::InterruptScope resetInterrupt;
	}
	assert(!S2::IsInterrupted());
}

void testScanInvalidPulseData()
{
	const char *args[] = { "s2", "scan", "simulation=on" };
	S2::Options options(3, args);
	std::stringstream progressOutput;
	S2::DefaultProgressMonitor progress(S2::Quiet, progressOutput);
	TestStreamFactory streamFactory;
	assert_throws<S2::IOError>([&] { S2::Scan(options, progress, streamFactory); });
}

void testControlCommand()
{
	const char *args[] = { "s2", "control", "simulation=on", "amplitude=5V" };
	S2::Options options(4, args);
	std::stringstream output;
	std::ostringstream console;
	std::streambuf *previousOutput = std::cout.rdbuf(console.rdbuf());
	S2::DefaultProgressMonitor progress(S2::Quiet, output);
	TestStreamFactory streamFactory;
	const int result = S2::Control(options, progress, streamFactory);
	std::cout.rdbuf(previousOutput);
	assert(result == 0);
	assert(streamFactory.generator->input.str() ==
		":w610\r\n:w620\r\n:w681\r\n:w32180\r\n:w25250\r\n:w26250\r\n");
}

void testControlOutputShutdown()
{
	const char *args[] = {
		"s2", "control", "simulation=on", "channel=1", "amplitude=5V", "output=on", "phase=90"
	};
	S2::Options options(7, args);
	std::stringstream output;
	std::ostringstream consoleOut;
	std::ostringstream consoleError;
	std::streambuf *previousOutput = std::cout.rdbuf(consoleOut.rdbuf());
	std::streambuf *previousError = std::cerr.rdbuf(consoleError.rdbuf());
	S2::DefaultProgressMonitor progress(S2::Quiet, output);
	TestStreamFactory streamFactory;
	const int result = S2::Control(options, progress, streamFactory);
	std::cout.rdbuf(previousOutput);
	std::cerr.rdbuf(previousError);
	assert(result != 0);

	const std::string commands = streamFactory.generator->input.str();
	const std::string enabled = ":w611\r\n";
	const std::string disabled = ":w610\r\n";
	assert(commands.find(enabled) != std::string::npos);
	assert(commands.rfind(disabled) > commands.find(enabled));
}

void testControlOutputAcknowledgementRetry()
{
	std::ostringstream consoleOut;
	std::ostringstream consoleError;
	std::streambuf *previousOutput = std::cout.rdbuf(consoleOut.rdbuf());
	std::streambuf *previousError = std::cerr.rdbuf(consoleError.rdbuf());

	{
		const char *args[] = { "s2", "control", "simulation=on", "amplitude=5V" };
		S2::Options options(4, args);
		std::stringstream output;
		S2::DefaultProgressMonitor progress(S2::Quiet, output);
		TestStreamFactory streamFactory;
		streamFactory.generator->failedOffAcknowledgements = 1;
		assert(S2::Control(options, progress, streamFactory) != 0);
		const std::string commands = streamFactory.generator->input.str();
		assert(CountOccurrences(commands, ":w610\r\n") == 2);
		assert(CountOccurrences(commands, ":w620\r\n") == 2);
	}

	{
		const char *args[] = { "s2", "control", "simulation=on", "channel=1", "output=on" };
		S2::Options options(5, args);
		std::stringstream output;
		S2::DefaultProgressMonitor progress(S2::Quiet, output);
		TestStreamFactory streamFactory;
		streamFactory.generator->failEnableAcknowledgement = true;
		assert(S2::Control(options, progress, streamFactory) != 0);
		const std::string commands = streamFactory.generator->input.str();
		const std::size_t enabled = commands.find(":w611\r\n");
		const std::size_t disabled = commands.rfind(":w610\r\n");
		assert(enabled != std::string::npos && disabled > enabled);
	}

	std::cout.rdbuf(previousOutput);
	std::cerr.rdbuf(previousError);
}

void testRawSendRejected()
{
	const char *args[] = { "s2", "control", "simulation=on", "send=:w6111" };
	S2::Options options(4, args);
	std::stringstream output;
	std::ostringstream consoleError;
	std::streambuf *previousError = std::cerr.rdbuf(consoleError.rdbuf());
	S2::DefaultProgressMonitor progress(S2::Quiet, output);
	TestStreamFactory streamFactory;
	assert(S2::Control(options, progress, streamFactory) != 0);
	std::cerr.rdbuf(previousError);
	assert(streamFactory.generator->input.str().find(":w6111") == std::string::npos);
}

void testProgram()
{
	S2::Options options;
	S2::Program program(options, "1000=10,10=20");
	assert(program.Duration() == 30.0);

	S2::ChannelState state;
	program.GetState(-1.0, state);
	assert(!state.output);
	assert(state.frequency == 0.0);

	program.GetState(0.0, state);
	assert(state.output);
	assert(state.frequency == 1000.0);
	assert(state.stepDuration == 10.0);

	program.GetState(10.0, state);
	assert(state.output);
	assert(state.frequency == 10.0);
	assert(state.stepDuration == 20.0);

	program.GetState(30.0, state);
	assert(!state.output);
	assert(state.frequency == 0.0);

	S2::Program amplitudeProgram(options, "1000A5=2");
	state = S2::ChannelState();
	amplitudeProgram.GetState(0.0, state);
	assert(state.output);
	assert(state.amplitude == 5.0);

	assert_throws<S2::SyntaxError>([&] {
		S2::Program invalid(options, "1000=0");
		invalid.Duration();
	});
	assert_throws<S2::SyntaxError>([&] {
		S2::Program invalid(options, "A5=1");
		invalid.Duration();
	});
	assert_throws<S2::SyntaxError>([&] {
		S2::Program invalid(options, "B0=1");
		invalid.Duration();
	});
	assert_throws<S2::SyntaxError>([&] {
		S2::Program invalid(options, "1000=nan");
		invalid.Duration();
	});

	const char *unsupportedFields[] = {
		"B10=1", "M10=1", "L10=1", "1000W1=1", "1000O5=1", "1000F2=1", "1000C5=1"
	};
	for (std::size_t i = 0; i < sizeof(unsupportedFields) / sizeof(unsupportedFields[0]); ++i)
	{
		assert_throws<S2::SyntaxError>([&] {
			S2::Program invalid(options, unsupportedFields[i]);
			invalid.Duration();
		});
	}
}

void testDatabaseCsvRows()
{
	S2::Options options;
	const std::string row =
		"\"Name, with comma\",\"Dataset \"\"quoted\"\"\",12.5,"
		"\"Description, with comma\",\"1000=1,2000=1\",organ,disease,0.25\r\n";
	S2::DatabaseProgram program(options, row);
	assert(program.name == "Name, with comma");
	assert(program.dataset == "Dataset \"quoted\"");
	assert(program.durationMinutes == 12.5);
	assert(program.description == "Description, with comma");
	assert(program.code == "1000=1,2000=1");
	assert(program.organ == "organ");
	assert(program.disease == "disease");
	assert(program.stepSize == 0.25);

	S2::DatabaseProgram backslashEscaped(
		options, "\"A \\\"quoted\\\" name\",dataset,1,description,1000,organ,disease,1");
	assert(backslashEscaped.name == "A \\\"quoted\\\" name");

	S2::DatabaseProgram emptyCells(options, "\"Empty\",,0,\"\",1000,organ,disease,");
	assert(emptyCells.dataset.empty());
	assert(emptyCells.description.empty());
	assert(emptyCells.durationMinutes == 0.0);
	assert(emptyCells.stepSize == 0.0);

	S2::DatabaseProgram extraColumn(
		options, "Name,dataset,1,description,1000,organ,disease,0.5,extra");
	assert(extraColumn.stepSize == 0.5);

	assert_throws<S2::IOError>([&] {
		S2::DatabaseProgram invalid(options, "\"unterminated,dataset,1,description,1000,organ,disease,1");
	});
	assert_throws<S2::IOError>([&] {
		S2::DatabaseProgram invalid(options, "\"name\"suffix,dataset,1,description,1000,organ,disease,1");
	});
	assert_throws<S2::IOError>([&] {
		S2::DatabaseProgram invalid(options, "Name,dataset,not-a-number,description,1000,organ,disease,1");
	});
	assert_throws<S2::IOError>([&] {
		S2::DatabaseProgram invalid(options, "Name,dataset,1,description,1000,organ,disease");
	});
}

void testDatabaseVisitorSkipsBlankLines()
{
	class RecordCollector : public S2::DatabaseVisitor
	{
	public:
		std::vector<int> rowIds;
		std::vector<std::string> records;
		void DatabaseRow(int rowId, const std::string &record)
		{
			rowIds.push_back(rowId);
			records.push_back(record);
		}
	};

	std::stringstream input("first row\r\n\r\n   \r\n\"multi\r\nline\",second\r\nlast row\r\n");
	RecordCollector collector;
	int nextRowId = 1;
	collector.DatabaseFile(nextRowId, input);
	assert(collector.rowIds.size() == 3);
	assert(collector.rowIds[0] == 1);
	assert(collector.rowIds[1] == 4);
	assert(collector.rowIds[2] == 6);
	assert(collector.records[1] == "\"multi\r\nline\",second\r");
	assert(nextRowId == 7);
}

void testValidateDatabaseDiagnostics()
{
	const char *args[] = { "s2", "validate" };
	S2::Options options(2, args);
	const std::string databasePath = options.DataFile("programs.csv");
	{
		std::ofstream database(databasePath.c_str());
		database << "\"Valid, name\",dataset,10,description,\"1000=1\",organ,disease,0.5\r\n";
		database << "\r\n";
		database << "Bad,dataset,nan,description,\"1000=1\",organ,disease,0.5\r\n";
		database << "Too,few,columns\r\n";
		database << "Empty,dataset,1,description,,organ,disease,0.5\r\n";
	}

	std::ostringstream errors;
	std::streambuf *previousError = std::cerr.rdbuf(errors.rdbuf());
	const int result = S2::ValidateDatabase(options);
	std::cerr.rdbuf(previousError);

	assert(result != 0);
	assert(errors.str().find(databasePath + ":3:") != std::string::npos);
	assert(errors.str().find("column 3") != std::string::npos);
	assert(errors.str().find(databasePath + ":4:") != std::string::npos);
	assert(errors.str().find("column 4") != std::string::npos);
	assert(errors.str().find(databasePath + ":5:") != std::string::npos);
	assert(errors.str().find("Program duration must be finite and positive") != std::string::npos);
	assert(errors.str().find("1 valid record(s)") != std::string::npos);
	std::remove(databasePath.c_str());
}

void testFindCommandMultilineCsv()
{
	const char *args[] = { "s2", "find", "name=alpha" };
	S2::Options options(3, args);
	const std::string databasePath = options.DataFile("programs.csv");
	{
		std::ofstream database(databasePath.c_str());
		database << "\r\n";
		database << "\"Alpha\r\nBeta\",dataset,10,description,1000,organ,disease,0.5\r\n";
	}

	std::stringstream progressOutput;
	S2::DefaultProgressMonitor progress(S2::Quiet, progressOutput);
	std::ostringstream results;
	std::streambuf *previousOutput = std::cout.rdbuf(results.rdbuf());
	const int result = S2::FindCommand(options, progress);
	std::cout.rdbuf(previousOutput);

	assert(result == 0);
	assert(results.str().find("2: Alpha\r\nBeta (dataset)") != std::string::npos);
	std::remove(databasePath.c_str());
}

void testPreset()
{
	std::stringstream contents;
	contents << "\"List2=Stage 1\"\r\n";
	contents << "\"List2=Stage 2\"\r\n";
	contents << "\"List4=2000=20,1000=10\"\r\n";
	contents << "\"List4=5000=80\"\r\n";

	S2::Options options;
	S2::Preset preset(options, contents);
	assert(preset.NumberOfPrograms() == 2);
	assert(preset.GetProgramDescription(0) == "Stage 1");
	assert(preset.GetProgram(0) == "2000=20,1000=10");
	assert(preset.Duration() == 110.0);

	S2::ChannelState state;
	preset.GetState(0.0, state);
	assert(state.output);
	preset.GetState(20.0, state);
	assert(state.frequency == 1000.0);
	preset.GetState(30.0, state);
	assert(state.frequency == 5000.0);
	preset.GetState(110.0, state);
	assert(!state.output);

	assert_throws<std::out_of_range>([&] { preset.GetProgram(2); });
	assert_throws<S2::IOError>([&] {
		std::stringstream malformed("\"List2=Only a description\"\n");
		S2::Preset invalid(options, malformed);
	});
	assert_throws<S2::IOError>([&] {
		std::stringstream malformed("\"List4=1000=1\"\n");
		S2::Preset invalid(options, malformed);
	});
}

void checkSequence(S2::MultiChannelSequence &sequence, double stepSize, bool loop, bool success,
	int generator, int channel, double timestamp, bool output, double frequency)
{
	S2::ChannelState state;
	assert(sequence.Next(state, stepSize, loop) == success);
	if (success)
	{
		assert(state.channelId == S2::ChannelId(generator, channel));
		assert(std::abs(state.time - timestamp) < 1e-9);
		assert(state.output == output);
		assert(std::abs(state.frequency - frequency) < 1e-9);
	}
}

void testMultiChannelSequence()
{
	S2::Options options;
	S2::MultiChannelSequence sequence;
	sequence.Add(S2::ChannelId(0, 0), std::make_shared<S2::Program>(options, "1000,2000"));
	sequence.Add(S2::ChannelId(1, 0),
		std::make_shared<S2::Program>(options, "3000=20,4000=280,1000-2000=5"));

	sequence.Begin();
	checkSequence(sequence, 1.0, true, true, 0, 0, 0.0, true, 1000.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 0.0, true, 3000.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 20.0, true, 4000.0);
	checkSequence(sequence, 1.0, true, true, 0, 0, 180.0, true, 2000.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 300.0, true, 1000.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 301.0, true, 1200.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 302.0, true, 1400.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 303.0, true, 1600.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 304.0, true, 1800.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 305.0, true, 3000.0);
	checkSequence(sequence, 1.0, true, true, 1, 0, 325.0, true, 4000.0);
	checkSequence(sequence, 1.0, true, true, 0, 0, 360.0, true, 1000.0);

	sequence.Begin();
	checkSequence(sequence, 1.0, false, true, 0, 0, 0.0, true, 1000.0);
	checkSequence(sequence, 1.0, false, true, 1, 0, 0.0, true, 3000.0);
	checkSequence(sequence, 1.0, false, true, 1, 0, 20.0, true, 4000.0);
	checkSequence(sequence, 1.0, false, true, 0, 0, 180.0, true, 2000.0);
	checkSequence(sequence, 1.0, false, true, 1, 0, 300.0, true, 1000.0);
	checkSequence(sequence, 1.0, false, true, 1, 0, 301.0, true, 1200.0);
	checkSequence(sequence, 1.0, false, true, 1, 0, 302.0, true, 1400.0);
	checkSequence(sequence, 1.0, false, true, 1, 0, 303.0, true, 1600.0);
	checkSequence(sequence, 1.0, false, true, 1, 0, 304.0, true, 1800.0);
	checkSequence(sequence, 1.0, false, true, 1, 0, 305.0, false, 0.0);
	checkSequence(sequence, 1.0, false, true, 0, 0, 360.0, false, 0.0);
	checkSequence(sequence, 1.0, false, false, 0, 0, 0.0, false, 0.0);

	S2::MultiChannelSequence oneStep;
	oneStep.Add(S2::ChannelId(4, 1), std::make_shared<S2::Program>(options, "1200=1"));
	oneStep.Begin();
	checkSequence(oneStep, 1.0, false, true, 4, 1, 0.0, true, 1200.0);
	checkSequence(oneStep, 1.0, false, true, 4, 1, 1.0, false, 0.0);
	checkSequence(oneStep, 1.0, false, false, 4, 1, 0.0, false, 0.0);

	assert_throws<std::invalid_argument>([&] {
		S2::MultiChannelSequence invalid;
		invalid.Add(S2::ChannelId(0, 0), std::make_shared<S2::Program>(options, ""));
	});
	S2::ChannelState unusedState;
	assert_throws<std::invalid_argument>([&] { oneStep.Next(unusedState, 0.0, false); });

	S2::MultiChannelSequence chained;
	chained.Add(S2::ChannelId(0, 0), std::make_shared<S2::Program>(options, "1000,2000"));
	chained.Add(S2::ChannelId(0, 0), std::make_shared<S2::Program>(options, "3000"));
	assert(chained.Duration() == 3.0 * 180.0);
}

void testWaveformLoading()
{
	std::stringstream samples;
	for (int index = 0; index < 1024; ++index)
		samples << ((index == 0) ? -1.0 : (index == 1023 ? 1.0 : 0.0)) << '\n';
	S2::WaveData data;
	S2::LoadFromFile(samples, data);
	assert(data[0] == 0);
	assert(data[1] == 512);
	assert(data[1023] == 1023);

	assert_throws<std::runtime_error>([] {
		std::stringstream shortFile("0 0 0");
		S2::WaveData invalid;
		S2::LoadFromFile(shortFile, invalid);
	});
	assert_throws<std::runtime_error>([] {
		std::stringstream outOfRange;
		for (int index = 0; index < 1024; ++index)
			outOfRange << (index == 7 ? 1.5 : 0.0) << ' ';
		S2::WaveData invalid;
		S2::LoadFromFile(outOfRange, invalid);
	});
	assert_throws<std::runtime_error>([] {
		std::stringstream extra;
		for (int index = 0; index < 1025; ++index)
			extra << "0 ";
		S2::WaveData invalid;
		S2::LoadFromFile(extra, invalid);
	});
}

void testRunInvalidDatabaseDoesNotOpenGenerator()
{
	const char *args[] = { "s2", "run", "simulation=on", "program=1" };
	S2::Options options(4, args);
	const std::string databasePath = options.DataFile("programs.csv");
	{
		std::ofstream database(databasePath.c_str());
		database << "invalid,dataset,1,description,1000=0,organ,disease,1\n";
	}

	std::stringstream progressOutput;
	S2::DefaultProgressMonitor progress(S2::Quiet, progressOutput);
	TestStreamFactory streamFactory;
	std::ostringstream console;
	std::streambuf *previousOutput = std::cout.rdbuf(console.rdbuf());
	const int result = S2::Run(options, progress, streamFactory);
	std::cout.rdbuf(previousOutput);
	assert(result != 0);
	assert(progressOutput.str().find(databasePath + ":1:") != std::string::npos);
	assert(streamFactory.generatorOpenCount == 0);
	assert(streamFactory.generator->input.str().empty());
	std::remove(databasePath.c_str());
}

void testRunOutputShutdownOnFailure()
{
	const char *args[] = {
		"s2", "run", "simulation=on", "channel=1", "code=1000A4=0.01"
	};
	S2::Options options(5, args);
	std::stringstream output;
	S2::DefaultProgressMonitor progress(S2::Quiet, output);
	TestStreamFactory streamFactory;
	streamFactory.generator->failEnableAcknowledgement = true;

	assert(S2::Run(options, progress, streamFactory) != 0);
	const std::string commands = streamFactory.generator->input.str();
	const std::size_t enabled = commands.find(":w611\r\n");
	const std::size_t disabled = commands.rfind(":w610\r\n");
	assert(enabled != std::string::npos && disabled > enabled);
}

void testRunCommandFiniteIterations()
{
	const char *args[] = {
		"s2", "run", "simulation=on", "generator=37", "channel=1",
		"iterations=2", "code=1000A4=0.01"
	};
	S2::Options options(7, args);
	assert(!options.loop);
	assert(options.iterations == 2);

	std::stringstream output;
	S2::DefaultProgressMonitor progress(S2::Quiet, output);
	TestStreamFactory streamFactory;
	assert(S2::Run(options, progress, streamFactory) == 0);

	const std::string commands = streamFactory.generator->input.str();
	assert(CountOccurrences(commands, ":w611\r\n") == 2);
	assert(CountOccurrences(commands, ":w610\r\n") == 3);
	assert(commands.find(":w25400\r\n") != std::string::npos);
	assert(commands.rfind(":w610\r\n") > commands.rfind(":w611\r\n"));
	assert(output.str().find("0.02s") != std::string::npos);
}

int main()
{
	setupTestEnvironment();
	testOptions();
	testGenerator();
	testGeneratorPartialIo();
#ifndef _WIN32
	testPosixDrainFailure();
#endif
#ifdef __linux__
	testLinuxHidReadFailure();
#endif
	testPulse();
	testScanFiniteIterations();
	testScanLoopInterrupt();
	testScanInvalidPulseData();
	testControlCommand();
	testControlOutputShutdown();
	testControlOutputAcknowledgementRetry();
	testRawSendRejected();
	testProgram();
	testDatabaseCsvRows();
	testDatabaseVisitorSkipsBlankLines();
	testValidateDatabaseDiagnostics();
	testFindCommandMultilineCsv();
	testPreset();
	testMultiChannelSequence();
	testWaveformLoading();
	testRunInvalidDatabaseDoesNotOpenGenerator();
	testRunOutputShutdownOnFailure();
	testRunCommandFiniteIterations();
	std::cout << "All unit tests passed\n";
	return 0;
}
