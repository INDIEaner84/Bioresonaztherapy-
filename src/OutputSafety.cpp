#include "S2.h"
#include "OutputSafety.h"

#include <exception>
#include <iostream>
#include <stdexcept>
#include <vector>

S2::OutputSafetyGuard::OutputSafetyGuard(Devices &devices) : devices(devices)
{
}

S2::OutputSafetyGuard::~OutputSafetyGuard()
{
	try
	{
		DisableAll();
	}
	catch (const std::exception &error)
	{
		std::cerr << "SAFETY WARNING: failed to confirm generator output-off: "
			<< error.what() << std::endl;
	}
	catch (...)
	{
		std::cerr << "SAFETY WARNING: failed to confirm generator output-off."
			<< std::endl;
	}
}

void S2::OutputSafetyGuard::EnsureOff(int generator, int channel)
{
	const ChannelKey key(generator, channel);
	std::map<ChannelKey, bool>::const_iterator state = lastCommandedState.find(key);
	if (state == lastCommandedState.end() || state->second || enabledByThisProcess.find(key) != enabledByThisProcess.end())
		SetOutput(generator, channel, false);
}

void S2::OutputSafetyGuard::SetOutput(int generator, int channel, bool on)
{
	const ChannelKey key(generator, channel);
	std::map<ChannelKey, bool>::const_iterator state = lastCommandedState.find(key);
	const bool alreadyEnabled = enabledByThisProcess.find(key) != enabledByThisProcess.end();
	if (state != lastCommandedState.end() && state->second == on && (on == alreadyEnabled))
		return;

	if (on)
	{
		// If the device accepts the command but the acknowledgement is lost, we
		// still need to attempt an off command during cleanup.
		enabledByThisProcess.insert(key);
		lastCommandedState.erase(key);
		devices.GetGenerator(generator).GetChannel(channel).Output(true);
		lastCommandedState[key] = true;
	}
	else
	{
		// An off command can also time out after reaching the device. Keep the
		// channel queued for another best-effort off attempt if acknowledgement
		// is lost, including when its initial hardware state was unknown.
		enabledByThisProcess.insert(key);
		lastCommandedState.erase(key);
		S2::Generator &device = devices.GetGenerator(generator);
		std::exception_ptr firstError;
		if (channel == 0)
		{
			// A failure on one output must not prevent an off attempt on the
			// other output of the synchronized channel.
			try
			{
				device.DisableOutput(0);
			}
			catch (...)
			{
				firstError = std::current_exception();
			}
			try
			{
				device.DisableOutput(1);
			}
			catch (...)
			{
				if (!firstError)
					firstError = std::current_exception();
			}
		}
		else if (channel == 1 || channel == 2)
		{
			try
			{
				device.DisableOutput(channel - 1);
			}
			catch (...)
			{
				firstError = std::current_exception();
			}
		}
		else
			throw std::invalid_argument("Invalid channel in output safety request");

		if (firstError)
			std::rethrow_exception(firstError);
		lastCommandedState[key] = false;
		enabledByThisProcess.erase(key);
	}
}

void S2::OutputSafetyGuard::DisableAll()
{
	const std::vector<ChannelKey> channels(enabledByThisProcess.begin(), enabledByThisProcess.end());
	std::exception_ptr firstError;

	for (std::vector<ChannelKey>::const_iterator channel = channels.begin(); channel != channels.end(); ++channel)
	{
		try
		{
			SetOutput(channel->first, channel->second, false);
		}
		catch (...)
		{
			if (!firstError)
				firstError = std::current_exception();
		}
	}

	if (firstError)
		std::rethrow_exception(firstError);
}
