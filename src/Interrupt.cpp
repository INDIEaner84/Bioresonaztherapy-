#include "Interrupt.h"

namespace
{
	volatile std::sig_atomic_t interrupted = 0;

	void HandleSignal(int)
	{
		interrupted = 1;
	}
}

bool S2::IsInterrupted()
{
	return interrupted != 0;
}

S2::InterruptScope::InterruptScope()
	: previousInterrupt(SIG_ERR), previousTerminate(SIG_ERR)
{
	interrupted = 0;
	previousInterrupt = std::signal(SIGINT, HandleSignal);
#ifdef SIGTERM
	previousTerminate = std::signal(SIGTERM, HandleSignal);
#endif
}

S2::InterruptScope::~InterruptScope()
{
	if (previousInterrupt != SIG_ERR)
		std::signal(SIGINT, previousInterrupt);
#ifdef SIGTERM
	if (previousTerminate != SIG_ERR)
		std::signal(SIGTERM, previousTerminate);
#endif
}

S2::Interrupted::Interrupted() : std::runtime_error("Operation interrupted by user")
{
}
