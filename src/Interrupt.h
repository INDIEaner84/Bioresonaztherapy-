#pragma once

#include <csignal>
#include <stdexcept>

namespace S2
{
	bool IsInterrupted();

	class InterruptScope
	{
	public:
		InterruptScope();
		InterruptScope(const InterruptScope &) = delete;
		InterruptScope &operator=(const InterruptScope &) = delete;
		~InterruptScope();

	private:
		typedef void (*SignalHandler)(int);
		SignalHandler previousInterrupt;
		SignalHandler previousTerminate;
	};

	class Interrupted : public std::runtime_error
	{
	public:
		Interrupted();
	};
}
