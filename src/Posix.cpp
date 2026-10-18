#include "S2.h"
#include "Posix.h"

#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <termios.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include <algorithm>
#include <cmath>

S2::PosixStream::PosixStream(int fd) : fd(fd)
{
}

S2::PosixStream::~PosixStream()
{
	close(fd);
}

int S2::PosixStream::Write(const char * data, int size)
{
	if (size < 0)
	{
		errno = EINVAL;
		return -1;
	}

	ssize_t written;
	do
	{
		written = write(fd, data, static_cast<size_t>(size));
	}
	while (written < 0 && errno == EINTR && !S2::IsInterrupted());

	if (written <= 0)
		return static_cast<int>(written);

	int drained;
	do
	{
		drained = tcdrain(fd);
	}
	while (drained < 0 && errno == EINTR && !S2::IsInterrupted());

	// A successful write followed by a drain failure is still an I/O failure:
	// the caller must not treat the command as fully delivered.
	if (drained < 0)
		return -1;
	return static_cast<int>(written);
}

int S2::PosixStream::Read(char * data, int size)
{
	if (size < 0)
	{
		errno = EINVAL;
		return -1;
	}

	ssize_t readCount;
	do
	{
		readCount = read(fd, data, static_cast<size_t>(size));
	}
	while (readCount < 0 && errno == EINTR && !S2::IsInterrupted());

	return static_cast<int>(readCount);
}


void S2::Sleep(double seconds)
{
	if (!std::isfinite(seconds) || seconds <= 0.0)
		return;

	while (seconds > 0.0 && !IsInterrupted())
	{
		const double interval = std::min(seconds, 0.1);
		usleep(static_cast<useconds_t>(interval * 1000000.0));
		seconds -= interval;
	}
}

int set_interface_attribs(int fd, int speed)
{
    struct termios tty;

    if (tcgetattr(fd, &tty) < 0) {
        printf("Error from tcgetattr: %s\n", strerror(errno));
        return -1;
    }

    cfsetospeed(&tty, (speed_t)speed);
    cfsetispeed(&tty, (speed_t)speed);

    tty.c_cflag |= (CLOCAL | CREAD);    /* ignore modem controls */
    tty.c_cflag &= ~CSIZE;
    tty.c_cflag |= CS8;         /* 8-bit characters */
    tty.c_cflag &= ~PARENB;     /* no parity bit */
    tty.c_cflag &= ~CSTOPB;     /* only need 1 stop bit */
    tty.c_cflag &= ~CRTSCTS;    /* no hardware flowcontrol */

    /* setup for non-canonical mode */
    tty.c_iflag &= ~(IGNBRK | BRKINT | PARMRK | ISTRIP | INLCR | IGNCR | ICRNL | IXON);
    tty.c_lflag &= ~(ECHO | ECHONL | ICANON | ISIG | IEXTEN);
    tty.c_oflag &= ~OPOST;

    /* fetch bytes as they become available */
    tty.c_cc[VMIN] = 1;
    tty.c_cc[VTIME] = 1;

    if (tcsetattr(fd, TCSANOW, &tty) != 0) {
        printf("Error from tcsetattr: %s\n", strerror(errno));
        return -1;
    }
    return 0;
}

void set_mincount(int fd, int mcount)
{
    struct termios tty;

    if (tcgetattr(fd, &tty) < 0) {
        printf("Error tcgetattr: %s\n", strerror(errno));
        return;
    }

    tty.c_cc[VMIN] = mcount ? 1 : 0;
    tty.c_cc[VTIME] = 5;        /* half second timer */

    if (tcsetattr(fd, TCSANOW, &tty) < 0)
        printf("Error tcsetattr: %s\n", strerror(errno));
}

std::shared_ptr<S2::Stream> S2::DefaultStreamFactory::Open(Devices &devices, Generator & generator)
{
	if(generator.Simulation())
		return std::make_shared<DummyGenerator>(true);

	auto filename = generator.filename;

	const int fd = open(filename.c_str(), O_EXCL | O_RDWR | O_NOCTTY | O_SYNC);
	if (fd == -1)
		throw IOError(std::string("Could not open device: ") + strerror(errno));

	if (set_interface_attribs(fd, B57600) != 0)
	{
		const int error = errno;
		close(fd);
		throw IOError(std::string("Could not configure generator serial settings: ") + strerror(error));
	}
	// set_mincount(fd, 5);

	return std::make_shared<PosixStream>(fd);
}

namespace Posix
{
	class Dir
	{
	public:
		Dir(const char * filename);
		~Dir();
		bool Next();
		const char * Filename() const;
		bool StartsWith(const char * pattern) const;
	private:
		DIR * dir;
		dirent * current;
	};
}

Posix::Dir::Dir(const char * filename) : dir(opendir(filename)), current(nullptr)
{
}

Posix::Dir::~Dir()
{
	if (dir != nullptr)
		closedir(dir);
}

bool Posix::Dir::Next()
{
	if (dir == nullptr)
		return false;
	current = readdir(dir);
	return current != nullptr;
}

const char * Posix::Dir::Filename() const
{
	return current == nullptr ? "" : current->d_name;
}

bool Posix::Dir::StartsWith(const char * pattern) const
{
	return current != nullptr && strncmp(current->d_name, pattern, strlen(pattern)) == 0;
}

void S2::Devices::FindDevices()
{
	int generator=1, pulse=1;
	for(Posix::Dir dir("/dev"); dir.Next();)
	{
		if(dir.StartsWith("cu.SLAB_USBtoUART")||dir.StartsWith("ttyUSB"))
			generators.push_back(S2::Generator(generator++, std::string("/dev/") + dir.Filename()));

		if(dir.StartsWith("hidraw"))
			pulses.push_back(S2::Pulse(pulse++, std::string("/dev/") + dir.Filename()));
	}
}

std::string S2::Options::DataDirectory() const
{
	char * home = getenv("HOME");
	if(home==nullptr)
		throw IOError("$HOME not set");

	mode_t mask = umask(0);
	umask(mask);
	std::string dir = home + std::string("/.s2");
	mkdir(dir.c_str(), 0777-mask);
	return dir;
}

std::string S2::Options::DataFile(const char * filename) const
{
	return dataDir + "/" + filename;
}


