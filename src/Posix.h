#pragma once

#include "Device.h"

namespace S2
{
	// Internal POSIX serial stream. Takes ownership of fd.
	class PosixStream : public Stream
	{
	public:
		explicit PosixStream(int fd);
		PosixStream(const PosixStream &) = delete;
		PosixStream &operator=(const PosixStream &) = delete;
		~PosixStream();

		int Read(char *data, int size);
		int Write(const char *data, int size);

	private:
		int fd;
	};
}
