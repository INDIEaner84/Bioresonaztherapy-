#pragma once

#include <vector>

namespace S2
{
	class Devices
	{
	public:
		// Enumerators all devices but does not try to open them.
		Devices(const Options & options);

		// Declared before the devices so it is destroyed after them. On Apple,
		// pulse streams refer to HID objects owned by this implementation.
		class Impl;
		std::shared_ptr<Impl> impl;

		std::vector<Pulse> pulses;
		std::vector<Generator> generators;

		// Throws DeviceNotFound when the requested device is unavailable.
		Pulse & GetPulse(int id);
		Generator & GetGenerator(int id);

	private:
		void FindDevices();
	};
}

