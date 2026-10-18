#include "S2.h"

#include <cmath>
#include <iostream>

namespace
{
	char ClassifyPulseChange(double delta)
	{
		// These legacy thresholds are display heuristics only. They are not a
		// validated sensor-quality or physiological interpretation algorithm.
		const double magnitude = std::abs(delta);
		if (magnitude < 4.0)
			return '-';
		if (delta > 0.0 && delta < 10.0)
			return '<';
		if (delta < 0.0 && delta > -10.0)
			return '>';
		return 'X';
	}
}

int S2::Scan(const Options &options, ProgressMonitor &, StreamFactory &streamFactory)
{
	Devices devices(options);
	Pulse &pulse = devices.GetPulse(options.pulse);
	pulse.Open(devices, streamFactory);

	if (IsInterrupted())
		return 130;

	// One iteration is one comparison and therefore requires two pulse readings.
	double previousValue = pulse.BPM();
	int comparisons = 0;
	while (!IsInterrupted() && (options.loop || comparisons < options.iterations))
	{
		const double currentValue = pulse.BPM();
		const char result = ClassifyPulseChange(currentValue - previousValue);
		previousValue = currentValue;

		std::cout << result << std::flush;
		++comparisons;
	}

	if (comparisons > 0)
		std::cout << std::endl;
	return IsInterrupted() ? 130 : 0;
}
