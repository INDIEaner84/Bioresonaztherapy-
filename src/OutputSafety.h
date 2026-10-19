#pragma once

#include <map>
#include <set>
#include <utility>

namespace S2
{
	class Devices;

	// Best-effort software interlock for channels whose output this process enables.
	// This is not a substitute for a hardware interlock or emergency stop.
	class OutputSafetyGuard
	{
	public:
		explicit OutputSafetyGuard(Devices &devices);
		OutputSafetyGuard(const OutputSafetyGuard &) = delete;
		OutputSafetyGuard &operator=(const OutputSafetyGuard &) = delete;
		~OutputSafetyGuard();

		// Establish an off state the first time a channel is touched in this process.
		void EnsureOff(int generator, int channel);
		void SetOutput(int generator, int channel, bool on);
		void DisableAll();

	private:
		typedef std::pair<int, int> ChannelKey;

		Devices &devices;
		std::map<ChannelKey, bool> lastCommandedState;
		std::set<ChannelKey> enabledByThisProcess;
	};
}
