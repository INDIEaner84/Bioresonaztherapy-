// #include "stdafx.h"
#include "S2.h"

#include <windows.h>
#include <algorithm>
#include <cstring>
#include <iostream>
#include <memory>
#include <cmath>
#include <cstdlib>
#include <vector>

const char hidPrefix[] = "HID#VID_0642&PID_0007";
const char generatorHwPrefix[] = "\\Device\\Silabser";

namespace S2
{
	class Win32Stream : public Stream
	{
	public:
		Win32Stream(HANDLE h);
		~Win32Stream();
		virtual int Read(char * buffer, int size);
		virtual int Write(const char * buffer, int size);
	private:
		HANDLE file;
	};
}

std::shared_ptr<S2::Stream> S2::DefaultStreamFactory::Open(Devices &, Pulse &p)
{
	if (p.Simulation())
		return std::make_shared<DummyPulse>();

	auto handle = CreateFileA(p.filename.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, 0);

	if (handle == INVALID_HANDLE_VALUE)
		throw DeviceNotFound();


	return std::make_shared<Win32Stream>(handle);
	// std::unique_ptr<S2::Stream>(new Win32Stream(handle));
}

int S2::Win32Stream::Read(char * buffer, int size)
{
	DWORD bytesRead = 0;
	if (!ReadFile(file, buffer, size, &bytesRead, nullptr))
		throw IOError("Error reading from device");
	return bytesRead;
}

S2::Win32Stream::Win32Stream(HANDLE h) : file(h)
{

}

int S2::Win32Stream::Write(const char * buffer, int size)
{
	DWORD bytesWritten = 0;
	BOOL w = WriteFile(file, buffer, size, &bytesWritten, nullptr);
	if (!w)
		throw IOError("Failed to write to generator");
	w = FlushFileBuffers(file);
	if(!w)
		throw IOError("Failed to write to generator");
	return bytesWritten;
}


namespace
{
	std::vector<char> QueryDosDeviceNames()
	{
		const DWORD maximumChars = 4u * 1024u * 1024u;
		DWORD capacity = 4096;
		while (capacity <= maximumChars)
		{
			std::vector<char> names(capacity, '\0');
			const DWORD length = QueryDosDeviceA(nullptr, names.data(), capacity);
			if (length != 0)
			{
				// Reserve an extra terminator in case the API's count excludes the
				// final NUL of the MULTI_SZ list.
				names.resize(static_cast<std::size_t>(length) + 1, '\0');
				names[length] = '\0';
				return names;
			}
			if (GetLastError() != ERROR_INSUFFICIENT_BUFFER)
				throw S2::IOError("Could not enumerate Windows device names");
			capacity *= 2;
		}
		throw S2::IOError("Windows device-name list exceeds the supported enumeration buffer");
	}
}

S2::Devices::Devices(const Options &options)
{
	if (options.simulation)
	{
		generators.push_back(Generator(options.generator, S2::simulation));
		pulses.push_back(Pulse(options.pulse, S2::simulation));
		return;
	}

	const std::vector<char> names = QueryDosDeviceNames();
	const char *device = names.data();
	const char *const end = names.data() + names.size();
	while (device < end && *device != '\0')
	{
		const char *terminator = std::find(device, end, '\0');
		if (terminator == end)
			throw IOError("Malformed Windows device-name list");
		const std::string deviceName(device, terminator);

		if (deviceName.compare(0, 3, "COM") == 0)
		{
			const char *suffix = deviceName.c_str() + 3;
			char *idEnd = nullptr;
			const long parsedId = std::strtol(suffix, &idEnd, 10);
			if (suffix != idEnd && *idEnd == '\0' && parsedId > 0 && parsedId <= 255)
			{
				std::vector<char> deviceId(MAX_PATH, '\0');
				const DWORD deviceIdLength = QueryDosDeviceA(
					deviceName.c_str(), deviceId.data(), static_cast<DWORD>(deviceId.size()));
				if (deviceIdLength != 0 &&
					std::strncmp(deviceId.data(), generatorHwPrefix, sizeof(generatorHwPrefix) - 1) == 0)
				{
					const std::string devicePath = std::string("\\\\.\\") + deviceName;
					generators.push_back(Generator(static_cast<int>(parsedId), devicePath));
				}
			}
		}
		else if (deviceName.compare(0, sizeof(hidPrefix) - 1, hidPrefix) == 0)
		{
			const std::string devicePath = std::string("\\\\.\\") + deviceName;
			pulses.push_back(Pulse(1 + static_cast<int>(pulses.size()), devicePath));
		}

		device = terminator + 1;
	}
}


void S2::Sleep(double seconds)
{
	if (!std::isfinite(seconds) || seconds <= 0.0)
		return;

	while (seconds > 0.0 && !IsInterrupted())
	{
		const double interval = seconds < 0.1 ? seconds : 0.1;
		const DWORD milliseconds = static_cast<DWORD>(interval * 1000.0 + 0.5);
		::Sleep(milliseconds == 0 ? 1 : milliseconds);
		seconds -= interval;
	}
}

std::shared_ptr<S2::Stream> S2::DefaultStreamFactory::Open(Devices &, Generator &generator)
{
	if (generator.Simulation())
		return std::make_shared<DummyGenerator>(true);

	auto handle = CreateFileA(generator.filename.c_str(), GENERIC_READ|GENERIC_WRITE, 0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, 0);

	if (handle == INVALID_HANDLE_VALUE)
		throw DeviceNotFound();

	PurgeComm(handle, PURGE_TXABORT | PURGE_RXABORT | PURGE_TXCLEAR | PURGE_RXCLEAR);
	DCB state;
	if (!GetCommState(handle, &state))
	{
		CloseHandle(handle);
		throw IOError("Could not read generator serial settings");
	}
	state.BaudRate = 57600;
	state.Parity = NOPARITY;
	state.ByteSize = 8;
	state.StopBits = ONESTOPBIT;
	if (!SetCommState(handle, &state))
	{
		CloseHandle(handle);
		throw IOError("Could not configure generator serial settings");
	}

	COMMTIMEOUTS timeouts;
	ZeroMemory(&timeouts, sizeof(timeouts));
	timeouts.ReadIntervalTimeout = 50;
	timeouts.ReadTotalTimeoutConstant = 200;
	timeouts.ReadTotalTimeoutMultiplier = 10;
	timeouts.WriteTotalTimeoutConstant = 1000;
	timeouts.WriteTotalTimeoutMultiplier = 10;
	if (!SetCommTimeouts(handle, &timeouts))
	{
		CloseHandle(handle);
		throw IOError("Could not configure generator I/O timeouts");
	}

	Sleep(0.06);
	return std::make_shared<Win32Stream>(handle);
}



S2::Win32Stream::~Win32Stream()
{
	CloseHandle(file);
}

// Returns the full path for a file in the data directory.
// On Windows, it uses backslashes; on POSIX systems, forward slashes.
std::string S2::Options::DataFile(const char *name) const {
  return dataDir + "\\" + name;
}

// Determines the data directory to use (e.g. ~/.s2 on Linux/Mac, or
// %APPDATA%\.s2 on Windows). If the environment variable is not set, it falls
// back to a local ".s2" directory.
std::string S2::Options::DataDirectory() const {
  const char *appData = std::getenv("APPDATA");
  if (appData)
    return std::string(appData) + "\\.s2";
  else
    return ".s2";
}
