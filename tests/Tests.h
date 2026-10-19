#pragma once

#include "S2.h"

#ifdef NDEBUG
#undef NDEBUG
#endif

#include <cassert>
#include <cstddef>
#include <functional>
#include <sstream>
#include <string>
#include <vector>

void setupTestEnvironment();
void testOptions();
void testGeneratorPartialIo();
void testRunOutputShutdownOnFailure();

// Checks exception type as well as the failure path; assertions remain enabled
// for the test executable even in a Release configuration.
template<typename T>
void assert_throws(std::function<void()> operation)
{
	try
	{
		operation();
		assert(!"Expected an exception but none was thrown");
	}
	catch (const T &)
	{
	}
	catch (...)
	{
		assert(!"An unexpected exception type was thrown");
	}
}

template<typename T>
void assert_nothrow(std::function<void()> operation)
{
	try
	{
		operation();
	}
	catch (...)
	{
		assert(!"Expected no exception");
	}
}

class TestGenerator : public S2::Stream
{
public:
	TestGenerator();
	int Read(char *buffer, int size);
	int Write(const char *buffer, int size);
	std::stringstream input;
	std::string lastCommand;
	std::string pendingCommand;
	std::string response;
	std::size_t responseOffset;
	int maxWriteChunk;
	int maxReadChunk;
	int failedOffAcknowledgements;
	bool failEnableAcknowledgement;
};

class TestPulse : public S2::Stream
{
public:
	TestPulse();
	int Read(char *buffer, int size);
	int Write(const char *buffer, int size);

	int readResult;
	unsigned interval;
	std::vector<unsigned> intervalSamples;
	std::size_t nextIntervalSample;
	int readCount;
	int interruptAfterReads;
};

class TestStreamFactory : public S2::StreamFactory
{
public:
	TestStreamFactory();
	std::shared_ptr<TestPulse> pulse;
	std::shared_ptr<TestGenerator> generator;
	int generatorOpenCount;
	std::shared_ptr<S2::Stream> Open(S2::Devices &devices, S2::Pulse &pulse);
	std::shared_ptr<S2::Stream> Open(S2::Devices &devices, S2::Generator &generator);
};
