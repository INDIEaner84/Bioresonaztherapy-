#include "Tests.h"

#include <cmath>
#include <cstdio>
#include <fstream>
#include <limits>
#include <string>

void testOptions()
{
	{
		S2::Options options;
		assert(std::string(options.command).empty());
		assert(options.generator == 0);
		assert(options.channel == 0);
		assert(options.pulse == 0);
		assert(options.iterations == 1);
		assert(!options.loop);
		assert(!options.simulation);
	}

	{
		const char *args[] = { "s2", "pulse" };
		S2::Options options(2, args);
		assert(std::string(options.command) == "pulse");
		assert(!options.loop);
	}

	{
		const char *args[] = { "s2", "control", "amplitude=4V" };
		S2::Options options(3, args);
		assert(options.amplitude == 4.0);
	}
	{
		const char *args[] = { "s2", "control", "amplitude=40mV" };
		S2::Options options(3, args);
		assert(std::abs(options.amplitude - 0.04) < 1e-12);
	}

	assert_throws<S2::InvalidUnit>([] {
		const char *args[] = { "s2", "control", "amplitude=10" };
		S2::Options options(3, args);
	});
	assert_throws<S2::InvalidUnit>([] {
		const char *args[] = { "s2", "control", "amplitude=10v" };
		S2::Options options(3, args);
	});
	assert_throws<S2::ValueOutOfRange>([] {
		const char *args[] = { "s2", "control", "amplitude=41V" };
		S2::Options options(3, args);
	});
	assert_throws<S2::InvalidCommandLineArgument>([] {
		const char *args[] = { "s2", "control", "amplitude=nanV" };
		S2::Options options(3, args);
	});
	assert_throws<S2::InvalidCommandLineArgument>([] {
		const char *args[] = { "s2", "control", "amplitude=infV" };
		S2::Options options(3, args);
	});
	assert_throws<S2::InvalidCommandLineArgument>([] {
		const char *args[] = { "s2", "control", "amplitude=1e309V" };
		S2::Options options(3, args);
	});

	{
		const char *args[] = { "s2", "control", "frequency=1Hz" };
		S2::Options options(3, args);
		assert(options.frequency == 1.0);
	}
	{
		const char *args[] = { "s2", "control", "frequency=1kHz" };
		S2::Options options(3, args);
		assert(options.frequency == 1000.0);
	}
	{
		const char *args[] = { "s2", "control", "frequency=1MHz" };
		S2::Options options(3, args);
		assert(options.frequency == 1000000.0);
	}
	{
		const char *args[] = { "s2", "control", "frequency=1mHz" };
		S2::Options options(3, args);
		assert(options.frequency == 0.001);
	}
	{
		const char *args[] = { "s2", "control", "frequency=1uHz" };
		S2::Options options(3, args);
		assert(options.frequency == 0.000001);
	}
	assert_throws<S2::InvalidUnit>([] {
		const char *args[] = { "s2", "control", "frequency=1" };
		S2::Options options(3, args);
	});
	assert_throws<S2::ValueOutOfRange>([] {
		const char *args[] = { "s2", "control", "frequency=5.1MHz" };
		S2::Options options(3, args);
	});

	{
		const char *args[] = { "s2", "control", "duration=2h" };
		S2::Options options(3, args);
		assert(options.duration == 7200.0);
	}
	{
		const char *args[] = { "s2", "control", "duration=30m" };
		S2::Options options(3, args);
		assert(options.duration == 1800.0);
	}
	{
		const char *args[] = { "s2", "control", "duration=0s" };
		S2::Options options(3, args);
		assert(options.duration == 0.0);
	}
	assert_throws<S2::ValueOutOfRange>([] {
		const char *args[] = { "s2", "control", "duration=-1s" };
		S2::Options options(3, args);
	});
	assert_throws<S2::InvalidUnit>([] {
		const char *args[] = { "s2", "control", "duration=1day" };
		S2::Options options(3, args);
	});
	assert_throws<S2::InvalidCommandLineArgument>([] {
		const char *args[] = { "s2", "control", "duration=nan" };
		S2::Options options(3, args);
	});

	{
		const char *args[] = { "s2", "control", "channel=2", "generator=3" };
		S2::Options options(4, args);
		assert(options.channel == 2);
		assert(options.generator == 3);
	}
	assert_throws<S2::ValueOutOfRange>([] {
		const char *args[] = { "s2", "control", "channel=3" };
		S2::Options options(3, args);
	});
	assert_throws<S2::ValueOutOfRange>([] {
		const char *args[] = { "s2", "control", "generator=-1" };
		S2::Options options(3, args);
	});
	assert_throws<S2::InvalidUnit>([] {
		const char *args[] = { "s2", "control", "channel=1x" };
		S2::Options options(3, args);
	});

	{
		const char *args[] = { "s2", "run", "loop=on", "iterations=4" };
		S2::Options options(4, args);
		assert(options.loop);
		assert(options.iterations == 4);
	}
	{
		const char *args[] = { "s2", "pulse", "iterations=5" };
		S2::Options options(3, args);
		assert(!options.loop);
		assert(options.iterations == 5);
	}
	assert_throws<S2::InvalidCommandLineArgument>([] {
		const char *args[] = { "s2", "control", "not-a-real-option=1" };
		S2::Options options(3, args);
	});

	// @FILE parsing is exercised end-to-end, including whitespace, CRLF and comments.
	{
		S2::Options base;
		const std::string configPath = base.dataDir + "/unit-options.txt";
		{
			std::ofstream config(configPath.c_str());
			config << "# unit test config\r\n  channel=2  \r\n\r\ngenerator=5\r\n";
		}
		const std::string argument = "@" + configPath;
		const char *args[] = { "s2", "control", argument.c_str() };
		S2::Options configured(3, args);
		assert(configured.channel == 2);
		assert(configured.generator == 5);
		std::remove(configPath.c_str());
	}

	// Simulation device selection must not enumerate or open real hardware.
	{
		const char *args[] = { "s2", "status", "simulation=on", "generator=17", "pulse=2" };
		S2::Options options(5, args);
		S2::Devices devices(options);
		assert(devices.generators.size() == 1);
		assert(devices.pulses.size() == 1);
		assert(devices.generators.front().id == 17);
		assert(devices.generators.front().Simulation());
		assert(devices.pulses.front().id == 2);
		assert(devices.GetGenerator(200).Simulation());
		assert(devices.GetPulse(15).Simulation());
	}
}
