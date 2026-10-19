#include "S2.h"

#include <fstream>
#include <iostream>
#include <string>

namespace
{
	void StripTrailingCarriageReturn(std::string &line)
	{
		if (!line.empty() && line[line.size() - 1] == '\r')
			line.erase(line.size() - 1);
	}

	std::string Trim(const std::string &value)
	{
		const std::string::size_type first = value.find_first_not_of(" \t");
		if (first == std::string::npos)
			return std::string();
		const std::string::size_type last = value.find_last_not_of(" \t");
		return value.substr(first, last - first + 1);
	}
}

S2::Preset::Preset(const Options &options, std::istream &contents)
{
	if (!contents)
		throw IOError("Cannot load preset");

	std::string line;
	int lineNumber = 0;
	while (std::getline(contents, line))
	{
		++lineNumber;
		StripTrailingCarriageReturn(line);
		line = Trim(line);
		if (line.empty() || line[0] == '#')
			continue;

		const bool quoted = line[0] == '"';
		if (quoted)
		{
			while (line.size() < 2 || line[line.size() - 1] != '"')
			{
				std::string nextLine;
				if (!std::getline(contents, nextLine))
					throw IOError("Unterminated quoted value in preset");
				++lineNumber;
				StripTrailingCarriageReturn(nextLine);
				line += "\n";
				line += nextLine;
			}
		}

		const std::string::size_type equals = line.find('=', quoted ? 1 : 0);
		if (equals == std::string::npos || (quoted && (line.size() < 2 || line[line.size() - 1] != '"')))
			throw IOError("Malformed key/value record in preset at line " + std::to_string(lineNumber));

		const std::string key = quoted
			? line.substr(1, equals - 1)
			: Trim(line.substr(0, equals));
		const std::string value = quoted
			? line.substr(equals + 1, line.size() - equals - 2)
			: Trim(line.substr(equals + 1));
		if (key.empty())
			throw IOError("Empty key in preset at line " + std::to_string(lineNumber));
		entries.insert(std::make_pair(key, value));
	}

	const std::size_t codeCount = entries.count("List4");
	const std::size_t descriptionCount = entries.count("List2");
	if (codeCount != descriptionCount)
		throw IOError("Preset has a different number of program codes and descriptions");

	for (std::multimap<std::string, std::string>::const_iterator code = entries.lower_bound("List4"),
		 description = entries.lower_bound("List2");
		 code != entries.upper_bound("List4") && description != entries.upper_bound("List2");
		 ++code, ++description)
	{
		programs.push_back(Program(options, description->second, code->second));
	}
}

int S2::Preset::NumberOfPrograms() const
{
	return static_cast<int>(programs.size());
}

const std::string &S2::Preset::GetProgram(int index) const
{
	if (index < 0 || static_cast<std::size_t>(index) >= programs.size())
		throw std::out_of_range("Preset program index is out of range");
	return programs[static_cast<std::size_t>(index)].Text();
}

const std::string &S2::Preset::GetProgramDescription(int index) const
{
	if (index < 0 || static_cast<std::size_t>(index) >= programs.size())
		throw std::out_of_range("Preset description index is out of range");
	return programs[static_cast<std::size_t>(index)].Name();
}

double S2::Preset::Duration() const
{
	double duration = 0.0;
	for (std::vector<Program>::const_iterator program = programs.begin(); program != programs.end(); ++program)
		duration += program->Duration();
	return duration;
}

std::string S2::Preset::Description() const
{
	return "Preset with " + std::to_string(programs.size()) + " program(s)";
}

void S2::Preset::GetState(double time, ChannelState &state) const
{
	if (time < 0.0)
	{
		state.output = false;
		state.amplitude = 0.0;
		state.frequency = 0.0;
		state.stepDuration = 0.0;
		return;
	}

	for (std::vector<Program>::const_iterator program = programs.begin(); program != programs.end(); ++program)
	{
		const double programDuration = program->Duration();
		if (time < programDuration)
		{
			program->GetState(time, state);
			return;
		}
		time -= programDuration;
	}

	state.output = false;
	state.amplitude = 0.0;
	state.frequency = 0.0;
	state.waveform = BuiltinWaveform::unknown;
	state.stepDuration = 0.0;
}
