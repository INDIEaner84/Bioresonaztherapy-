// S2.cpp : Defines the entry point for the console application.
//

#include <iostream>
#include "S2.h"
#include <string>
#include <cstring>


int S2::StatusCommand(const Options&options, ProgressMonitor &pm, StreamFactory &sf)
{
	Devices devices(options);

	if (devices.pulses.size()==0)
		std::cout << "Pulse not connected\n";
	else
		std::cout << devices.pulses.size() << " pulse connected:\n";
	for(const auto & device : devices.pulses)
		// if(device.filename!="")
		std::cout << "  " << device.id << ": " << device.filename << std::endl;

	if (devices.generators.size()==0)
	{
		std::cout << "No generators connected\n";

	}
	else
		std::cout << devices.generators.size() << " generators connected:\n";
	for (const auto & g : devices.generators)
		//if(g.id!=-1)
		std::cout << "  " << g.id << ": " << g.filename << std::endl;
	return 0;
}

int S2::PulseCommand(const Options & options, ProgressMonitor &pm, StreamFactory &sf)
{
	bool loop = options.loop;
	if (loop)
	{
		std::cout << "Reading pulse. Press Ctrl+C to stop.\n";
	}
	try
	{
		Devices devices(options);
		Pulse &pulse = devices.GetPulse(options.pulse);
		pulse.Open(devices, sf);

		for (int i = 0; (loop || i < options.iterations) && !IsInterrupted(); ++i)
			std::cout << pulse.BPM() << " bpm\n";
		return IsInterrupted() ? 130 : 0;
	}
	catch (const DeviceNotFound&)
	{
		std::cout << "Pulse not found. Ensure that the device is connected.\n";
		return 1;
	}
}

int main(int argc, const char *argv[])
{
	return S2::Main(argc, argv);
}

void S2::Diagnose()
{
}

int S2::Main(int argc, const char *argv[])
{
	if (argc < 2)
	{
		PrintHelp();
		return 0;
	}

	try
	{
		Options options(argc, argv);
		const std::string command = options.command;
		DefaultStreamFactory streamFactory;
		DefaultProgressMonitor progress(options.verbosity, std::cout);
		InterruptScope interruptScope;
		int result = 0;

		if (command == "status")
			result = StatusCommand(options, progress, streamFactory);
		else if (command == "pulse")
			result = PulseCommand(options, progress, streamFactory);
		else if (command == "diagnose")
			Diagnose();
		else if (command == "scan")
			result = Scan(options, progress, streamFactory);
		else if (command == "control")
			result = Control(options, progress, streamFactory);
		else if (command == "help")
			PrintHelp();
		else if (command == "set")
			result = Set(options);
		else if (command == "run")
			result = Run(options, progress, streamFactory);
		else if (command == "find")
			result = FindCommand(options, progress);
		else if (command == "validate")
			result = ValidateDatabase(options);
		else
			throw InvalidCommandLineArgument(options.command);

		return IsInterrupted() ? 130 : result;
	}
	catch (const Interrupted &error)
	{
		std::cerr << error.what() << std::endl;
		return 130;
	}
	catch (const ValueOutOfRange &error)
	{
		std::cerr << "The supplied argument is out of range: " << error.option << std::endl;
		return 1;
	}
	catch (const InvalidCommandLineArgument &error)
	{
		std::cerr << "Invalid command or option: " << error.option << std::endl;
		return 1;
	}
	catch (const std::exception &error)
	{
		std::cerr << "Error: " << error.what() << std::endl;
		return IsInterrupted() ? 130 : 1;
	}
}

