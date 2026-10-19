#include <iostream>
#include "S2.h"
#include <string>
#include <fstream>
#include <cstring>
#include <cmath>
#include <cerrno>
#include <cctype>
#include <cstdlib>
#include <limits>

void S2::PrintHelp()
{
	std::cout << "s2 - experimental CLI intended for Spooky2-compatible hardware\n"
		"\n"
		"Safety and scientific status: this is an experimental device-control tool. This\n"
		"repository has not validated it for medical diagnosis, prevention, or treatment.\n"
		"It does not establish clinical efficacy, electrical safety, calibration, or delivered\n"
		"output. Review the project safety documentation before connecting hardware.\n"
		"\n"
		"Usage: s2 <command> [name=value ...] [@options-file]\n\n"
		"Commands:\n"
		"  status    List devices found by this platform's enumerator\n"
		"  pulse     Read pulse-sensor values (one reading by default)\n"
		"  control   Apply command-line generator settings in order\n"
		"  run       Run a program or preset (one pass by default)\n"
		"  scan      Experimental pulse-change display; not a validated scan\n"
		"  set       Save or display generator selection settings\n"
		"  find      Search the local programs.csv database\n"
		"  validate  Validate local programs.csv fields and program syntax\n"
		"  help      Display this help\n"
		"\n"
		"Common options:\n"
		"  generator=N       Generator identifier (0 selects the first device)\n"
		"  channel=N         0=both (synchronised), 1=channel 1, 2=channel 2\n"
		"  pulse=N           Pulse-sensor identifier (0 selects the first device)\n"
		"  simulation=on|off Use a software-only dummy device; no physical output\n"
		"  amplitude=NV      Amplitude setpoint, 0-40 V (for example 5V or 40mV)\n"
		"  frequency=NHz     Frequency setpoint, 0-5 MHz (for example 54kHz)\n"
		"  duration=N[s|m|h] Delay in control scripts (for example 10s or 2m)\n"
		"  output=on|off     Explicitly set generator output in control scripts\n"
		"  loop=on|off       Repeat indefinitely when on; off is the default\n"
		"  iterations=N      Number of finite runs/readings/scan comparisons (default 1)\n"
		"  preset=PATH       Load a Spooky2 preset text file for 'run'\n"
		"  program=ID        Load a database program for 'run'\n"
		"  code=TEXT         Run inline program code, e.g. code=1000=1,2000=1\n"
		"  waveform=NAME     Built-in waveform for 'control'; custom file uses 1024 samples\n"
		"  @FILE             Read one option per line; blank lines and # comments are ignored\n"
		"\n"
		"Examples (simulation=on is recommended for software-only tests):\n"
		"  s2 status\n"
		"  s2 control simulation=on generator=0 channel=1 frequency=54kHz amplitude=5V output=on duration=1m output=off\n"
		"  s2 run simulation=on code=1000=1,2000=1 iterations=2\n"
		"  s2 pulse simulation=on iterations=5\n"
		"  s2 scan simulation=on iterations=10\n"
		"\n"
		"See README.md, docs/SCIENTIFIC_INTEGRITY.md, and docs/TASK_CATALOG.md for limitations,\n"
		"safety notes, testing instructions, and the engineering/research roadmap.\n";
}

S2::InvalidCommandLineArgument::InvalidCommandLineArgument(const char * option) :
	std::runtime_error("Invalid command line argument"), option(option)
{
}

S2::InvalidUnit::InvalidUnit(const char * option) : InvalidCommandLineArgument(option)
{
}

S2::Options::Options(int argc, const char *argv[]) : dataDir(DataDirectory())
{
	this->argc = argc;
	this->argv = argv;
	command = (argc > 1 && argv != nullptr && argv[1] != nullptr) ? argv[1] : "";
	iterations = 1;
	generator = 0;
	pulse = 0;
	channel = 0;
	simulation = false;
	verbosity = Normal;
	loop = false;
	ramp = 0.0;
	duration = 0.0;
	frequency = std::nan("");
	amplitude = 10.0;

	Visit(*this);
}

void S2::Options::Visit(OptionsVisitor &visitor) const
{
	// Apply persistent settings first; command-line options override them.
	const std::string settingsName = DataFile("settings.txt");
	std::ifstream settingsFile(settingsName.c_str());
	if (settingsFile)
		VisitFile(settingsFile, visitor);

	if (argc < 2 || argv == nullptr)
		return;

	for (int i = 2; i < argc; ++i)
	{
		if (argv[i] == nullptr)
			throw InvalidCommandLineArgument("<null>");

		if (argv[i][0] == '@')
		{
			std::ifstream optionsFile(argv[i] + 1);
			if (!optionsFile)
				throw IOError("Cannot open options file");
			VisitFile(optionsFile, visitor);
		}
		else
		{
			visitor.OnOption(argv[i]);
		}
	}
}

void S2::Options::VisitFile(std::istream &file, OptionsVisitor &visitor) const
{
	std::string line;
	while (std::getline(file, line))
	{
		if (!line.empty() && line[line.size() - 1] == '\r')
			line.erase(line.size() - 1);

		const std::string::size_type first = line.find_first_not_of(" \t");
		if (first == std::string::npos || line[first] == '#')
			continue;

		const std::string::size_type last = line.find_last_not_of(" \t");
		line = line.substr(first, last - first + 1);
		visitor.OnOption(line.c_str());
	}
}

void S2::Options::SaveOptions() const
{
	auto name = DataFile("settings.txt");
	std::ofstream file(name);
	SaveOptions(file);
}

void S2::Options::SaveOptions(std::ostream&file) const
{
	file << "channel=" << channel << std::endl;
	file << "generator=" << generator << std::endl;
}

bool S2::OptionsVisitor::parseInt(const char *option, const char *variable, int min, int max, int &output)
{
	const size_t len = std::strlen(variable);
	if (std::strncmp(option, variable, len) != 0 || option[len] != '=')
		return false;

	const char *value = option + len + 1;
	char *end = nullptr;
	errno = 0;
	const long parsed = std::strtol(value, &end, 10);
	if (end == value || errno == ERANGE)
		throw InvalidCommandLineArgument(option);
	if (*end != '\0')
		throw InvalidUnit(option);
	if (parsed < min || parsed > max)
		throw ValueOutOfRange(option);

	output = static_cast<int>(parsed);
	return true;
}

bool S2::OptionsVisitor::parseSuffix(const char *option, const char *variable, const char *suffix, double min, double max, double &output)
{
	const size_t len = std::strlen(variable);
	if (std::strncmp(option, variable, len) != 0 || option[len] != '=')
		return false;

	const char *value = option + len + 1;
	char *end = nullptr;
	errno = 0;
	output = std::strtod(value, &end);
	if (end == value || errno == ERANGE || !std::isfinite(output))
		throw InvalidCommandLineArgument(option);

	double multiplier = 1.0;
	switch (*end)
	{
	case 'k': multiplier = 1000.0; ++end; break;
	case 'M': multiplier = 1000000.0; ++end; break;
	case 'm': multiplier = 0.001; ++end; break;
	case 'u': multiplier = 0.000001; ++end; break;
	default: break;
	}

	if (std::strcmp(end, suffix) != 0)
		throw InvalidUnit(option);

	output *= multiplier;
	if (!std::isfinite(output))
		throw ValueOutOfRange(option);
	if (output < min || output > max)
		throw ValueOutOfRange(option);
	return true;
}

bool S2::OptionsVisitor::parseDuration(const char *option, const char *variable, double &duration)
{
	const size_t len = std::strlen(variable);
	if (std::strncmp(option, variable, len) != 0 || option[len] != '=')
		return false;

	const char *value = option + len + 1;
	char *end = nullptr;
	errno = 0;
	double parsed = std::strtod(value, &end);
	if (end == value || errno == ERANGE || !std::isfinite(parsed))
		throw InvalidCommandLineArgument(option);

	double multiplier = 1.0;
	if (std::strcmp(end, "") == 0 || std::strcmp(end, "s") == 0)
		multiplier = 1.0;
	else if (std::strcmp(end, "m") == 0)
		multiplier = 60.0;
	else if (std::strcmp(end, "h") == 0)
		multiplier = 3600.0;
	else
		throw InvalidUnit(option);

	duration = parsed * multiplier;
	if (!std::isfinite(duration) || duration < 0.0 || duration > 315360000.0)
		throw ValueOutOfRange(option);
	return true;
}

bool S2::OptionsVisitor::parseBool(const char * option, const char * variable, bool & output)
{
	int len = strlen(variable);
	if (strncmp(option, variable, len) == 0 && option[len] == '=')
	{
		const char * value = option + len + 1;
		if (strcmp(value, "true") == 0 || strcmp(value, "yes") == 0 || strcmp(value, "on") == 0 || strcmp(value, "1") == 0)
			output = true;
		else if (strcmp(value, "false") == 0 || strcmp(value, "no") == 0 || strcmp(value, "off") == 0 || strcmp(value, "0") == 0)
			output = false;
		else
			throw InvalidCommandLineArgument(option);
		return true;
	}
	return false;
}

bool S2::OptionsVisitor::parseString(const char * option, const char * variable, const char*& output)
{
	int len = strlen(variable);
	if (strncmp(option, variable, len) == 0 && option[len] == '=')
	{
		output = option + len + 1;
		return true;
	}
	return false;
}

bool S2::OptionsVisitor::splitOption(const char *option, const char *variable, const char *&value, const char *&unit)
{
	const size_t len = std::strlen(variable);
	if (std::strncmp(option, variable, len) != 0 || option[len] != '=')
		return false;

	value = option + len + 1;
	unit = value + std::strlen(value);
	while (unit > value && (std::isalpha(static_cast<unsigned char>(unit[-1])) || unit[-1] == '%'))
		--unit;
	return true;
}

bool S2::OptionsVisitor::parsePercent(const char *option, const char *variable, double min, double max, double &output)
{
	const char *value = nullptr;
	const char *unit = nullptr;
	if (!splitOption(option, variable, value, unit))
		return false;

	char *end = nullptr;
	errno = 0;
	output = std::strtod(value, &end);
	if (end == value || errno == ERANGE || !std::isfinite(output))
		throw InvalidCommandLineArgument(option);
	if (end != unit)
		throw InvalidUnit(option);
	if (*unit == '%')
		output /= 100.0;
	else if (*unit != '\0')
		throw InvalidUnit(option);

	if (output < min || output > max)
		throw ValueOutOfRange(option);
	return true;
}

void S2::OptionsVisitor::Waveform(const char * str)
{
	WaveData d;
	LoadFromFile(str, d);
	Waveform(d);
}

S2::ValueOutOfRange::ValueOutOfRange(const char * option) : InvalidCommandLineArgument(option)
{
}

void S2::OptionsVisitor::OnOption(const char * option)
{
	double d;
	int i;
	bool b;
	const char * str, *unit;
	if (parseInt(option, "generator", 0, 255, i))
		Generator(i);
	else if (parseInt(option, "channel", 0, 2, i))
		Channel(i);
	else if (parseSuffix(option, "frequency", "Hz", 0.0, 5e6, d))
		Frequency(d);
	else if (parseSuffix(option, "amplitude", "V", 0.0, 40.0, d))
		Amplitude(d);
	else if (parseDuration(option, "duration", d))
		Duration(d);
	else if (parseBool(option, "output", b))
		Output(b);
	else if (parseString(option, "send", str))
		Send(str);
	else if (parsePercent(option, "offset", -1.0, 1.0, d))
		Offset(d);
	else if (splitOption(option, "waveform", str, unit))
	{
		if (strcmp(str, "sine") == 0) Waveform(BuiltinWaveform::sine);
		else if (strcmp(str, "square") == 0) Waveform(BuiltinWaveform::square);
		else if (strcmp(str, "sawtooth") == 0) Waveform(BuiltinWaveform::sawtooth);
		else if (strcmp(str, "hbomb") == 0) Waveform(h_bomb);
		else Waveform(str);
	}
	else if (parsePercent(option, "duty", 0.0, 1.0, d))
		Duty(d);
	else if (parseInt(option, "phase", 0, 359, i))
		Phase(i);
	else if (parseBool(option, "sync", b))
		Sync(b);
	else if (parseInt(option, "pulse", 0, 16, i))
		Pulse(i);
	else if (parseString(option, "preset", str))
		Preset(str);
	else if (parseBool(option, "simulation", b))
		Simulation(b);
	else if(parseString(option, "name", str))
		Name(str);
	else if(parseInt(option, "program", 1, 100000, i))
		Program(i);
	else if(parseString(option, "code", str))
		Code(str);
	else if(parseInt(option, "verbosity", 0, 5, i))
		Verbosity((S2::Verbosity)i);
	else if(parseBool(option, "loop", b))
		Loop(b);
	else if(parseInt(option, "iterations", 1, 1000000, i))
		Iterations(i);
	else
		UnrecognisedOption(option);
}

void S2::Options::Waveform(BuiltinWaveform)
{
}

void S2::Options::Waveform(const WaveData&)
{
}

void S2::Options::UnrecognisedOption(const char *option)
{
	throw InvalidCommandLineArgument(option);
}

void S2::Options::Output(bool b)
{
}

void S2::Options::Frequency(double f)
{
	frequency = f;
}

void S2::Options::Duration(double d)
{
	duration = d;
}

void S2::Options::Amplitude(double a)
{
	amplitude = a;
}

void S2::Options::Channel(int c)
{
	channel = c;
}

void S2::Options::Generator(int g)
{
	generator = g;
}

void S2::Options::Send(const char*)
{
}

void S2::Options::Lock(bool b)
{
}

void S2::Options::Phase(int p)
{
}

void S2::Options::Offset(double p)
{
}

void S2::Options::Sync(bool b)
{
}

void S2::Options::Duty(double percent)
{
}

void S2::Options::Pulse(int id)
{
	pulse = id;
}

void S2::Options::Preset(const char * filename)
{
	preset = filename;
}

void S2::Options::Simulation(bool b)
{
	simulation = b;
}

void S2::Options::Verbosity(S2::Verbosity v)
{
	verbosity = v;
}

void S2::Options::Loop(bool b)
{
	loop = b;
}

void S2::Options::Iterations(int i)
{
	iterations = i;
}

void S2::OptionsVisitor::Duration(double seconds)
{
}

void S2::OptionsVisitor::UnrecognisedOption(const char *option)
{
	throw InvalidCommandLineArgument(option);
}

void S2::OptionsVisitor::Generator(int generator)
{
}

void S2::OptionsVisitor::Channel(int channel)
{
}

void S2::OptionsVisitor::Pulse(int id)
{
}

void S2::OptionsVisitor::Amplitude(double a)
{
}

void S2::OptionsVisitor::Frequency(double frequency)
{
}

void S2::OptionsVisitor::Output(bool on)
{
}

void S2::OptionsVisitor::Waveform(BuiltinWaveform wf)
{
}

void S2::OptionsVisitor::Waveform(const WaveData&)
{
}

void S2::OptionsVisitor::Send(const char * cmd)
{
}

void S2::OptionsVisitor::Lock(bool b)
{
}

void S2::OptionsVisitor::Offset(double p)
{
}

void S2::OptionsVisitor::Phase(int degrees) {}
void S2::OptionsVisitor::Sync(bool on) {}
void S2::OptionsVisitor::Duty(double percent) {}
void S2::OptionsVisitor::Preset(const char * filename){}
void S2::OptionsVisitor::Simulation(bool b){}
void S2::OptionsVisitor::Name(const char * name){}
void S2::OptionsVisitor::Program(int id) {}
void S2::OptionsVisitor::Code(const char * code) {}
void S2::OptionsVisitor::Verbosity(S2::Verbosity) {}
void S2::OptionsVisitor::Loop(bool) {}
void S2::OptionsVisitor::Iterations(int) {}

#include <cstdlib>  // for std::getenv
