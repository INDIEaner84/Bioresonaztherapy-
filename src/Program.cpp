#include "S2.h"
#include <cstring>
#include <cmath>
#include <cassert>
#include <algorithm>
#include <cctype>
#include <cerrno>
#include <limits>

S2::ChannelState::ChannelState()
	: channelId(0, 0), time(0.0), output(false),
	  amplitude(std::numeric_limits<double>::quiet_NaN()),
	  frequency(std::numeric_limits<double>::quiet_NaN()),
	  waveform(BuiltinWaveform::unknown), stepDuration(0.0)
{
}

S2::Program::Program(const Options & options, const std::string & c) : Code(options), code(c)
{
}

S2::Program::Program(const Options & options, const std::string & name, const std::string & c) : Code(options), name(name), code(c)
{
}

const std::string &S2::Program::Name() const
{
	return name;
}

const std::string &S2::Program::Text() const
{
	return code;
}

std::pair<const char *, const char *> S2::Program::GetCode() const
{
	return std::make_pair(code.c_str(), code.c_str() + code.length());
}

void S2::Code::GetState(double time, ChannelState &state) const
{
	if (time >= 0.0)
	{
		auto code = GetCode();
		for (const char *position = code.first; position != code.second; )
		{
			ProgramStep step(options, position, code.second);
			if (time < step.Duration())
			{
				step.GetState(time, state);
				return;
			}
			time -= step.Duration();
		}
	}

	state.output = false;
	state.amplitude = 0.0;
	state.frequency = 0.0;
	state.waveform = BuiltinWaveform::unknown;
	state.stepDuration = 0.0;
}

double S2::Code::Duration() const
{
	double seconds = 0.0;
	const auto code = GetCode();
	for (const char *position = code.first; position < code.second; )
	{
		ProgramStep step(options, position, code.second);
		seconds += step.Duration();
		if (!std::isfinite(seconds))
			throw SyntaxError(position);
	}
	return seconds;
}

S2::ProgramStep::ProgramStep(const Options &options, const char *&position, const char *end)
	: f1(std::nan("")), f2(std::nan("")), duration(180.0),
	  amplitude(std::nan("")), offset(std::nan("")), fmultiplier(1.0),
	  foffset(0.0), l(0.0), waveform(-1)
{
	bool descending = false;
	bool finished = false;
	while (position < end && !finished)
	{
		switch (*position)
		{
		case '=':
			++position;
			duration = ReadNumber(position, end);
			break;
		case ',':
			++position;
			finished = true;
			break;
		case '-':
			descending = true;
			++position;
			break;
		case 'A':
			++position;
			amplitude = ReadNumber(position, end);
			if (amplitude < 0.0 || amplitude > 40.0)
				throw SyntaxError(position);
			break;
		case 'W':
		case 'L':
		case 'O':
		case 'F':
		case 'C':
			throw SyntaxError(position, "Unsupported program field");
		default:
			if (std::isspace(static_cast<unsigned char>(*position)))
			{
				++position;
				break;
			}
			{
				const double frequency = ReadFrequency(options, position, end);
				if (!std::isfinite(frequency) || frequency < 0.0 || frequency > 5e6)
					throw SyntaxError(position);
				if (descending)
				{
					f2 = frequency;
					descending = false;
				}
				else
				{
					f1 = frequency;
					f2 = frequency;
				}
			}
			break;
		}
	}

	if (descending || !std::isfinite(duration) || duration <= 0.0 ||
		!std::isfinite(f1) || !std::isfinite(f2))
		throw SyntaxError(position);
}

double S2::ProgramStep::ReadNumber(const char *&position, const char *end)
{
	if (position >= end)
		throw SyntaxError(position);

	char *next = nullptr;
	errno = 0;
	const double number = std::strtod(position, &next);
	if (next == position || errno == ERANGE || !std::isfinite(number))
		throw SyntaxError(position);
	position = next;
	return number;
}

double S2::ProgramStep::ReadFrequency(const Options &, const char *&position, const char *end)
{
	if (position >= end)
		throw SyntaxError(position);
	if (*position == 'B' || *position == 'M' || *position == 'L')
		throw SyntaxError(position, "Unsupported derived-frequency unit");

	const double frequency = ReadNumber(position, end);
	if (!std::isfinite(frequency) || frequency < 0.0 || frequency > 5e6)
		throw SyntaxError(position);
	return frequency;
}

void S2::ProgramStep::GetState(double time, ChannelState &output) const
{
	output.output = true;
	output.frequency = f1 + (f2 - f1) * (time / duration);
	output.stepDuration = f1 == f2 ? duration : 0.0;
	if (!std::isnan(amplitude))
		output.amplitude = amplitude;
}

double S2::ProgramStep::Duration() const
{
	return duration;
}

void S2::MultiChannelSequence::Add(ChannelId channel, const std::shared_ptr<Sequence> &sequence)
{
	if (!sequence)
		throw std::invalid_argument("Cannot schedule a null sequence");
	if (channel.second < 0 || channel.second > 2)
		throw std::invalid_argument("Invalid channel in sequence");
	const double duration = sequence->Duration();
	if (!std::isfinite(duration) || duration <= 0.0)
		throw std::invalid_argument("A scheduled sequence must have a finite, positive duration");

	const bool has0 = sequences.find(ChannelId(channel.first, 0)) != sequences.end();
	const bool has1 = sequences.find(ChannelId(channel.first, 1)) != sequences.end();
	const bool has2 = sequences.find(ChannelId(channel.first, 2)) != sequences.end();
	if ((channel.second == 0 && (has1 || has2)) || (has0 && channel.second != 0))
		throw ChannelInUse(channel);

	const auto existing = sequences.find(channel);
	if (existing == sequences.end())
		sequences.insert(std::make_pair(channel, sequence));
	else
		existing->second = Chain(existing->second, sequence);
}

void S2::MultiChannelSequence::Begin()
{
	heap.clear();
	heap.reserve(sequences.size());
	for (const auto &entry : sequences)
	{
		ChannelState state;
		state.channelId = entry.first;
		state.time = 0.0;
		entry.second->GetState(0.0, state);
		heap.push_back(state);
	}
	std::make_heap(heap.begin(), heap.end());
}

bool S2::ChannelState::operator<(const ChannelState &other) const
{
	return time > other.time || (time == other.time && channelId > other.channelId);
}

bool S2::MultiChannelSequence::Next(ChannelState &state, double stepSize, bool loop)
{
	if (!std::isfinite(stepSize) || stepSize <= 0.0)
		throw std::invalid_argument("Sequence step size must be finite and positive");
	if (heap.empty())
		return false;

	state = heap.front();
	std::pop_heap(heap.begin(), heap.end());

	const auto sequencePosition = sequences.find(state.channelId);
	if (sequencePosition == sequences.end())
		throw std::logic_error("Scheduled sequence disappeared");
	const std::shared_ptr<Sequence> &sequence = sequencePosition->second;
	const double duration = sequence->Duration();
	const double interval = state.stepDuration == 0.0 ? stepSize : state.stepDuration;
	if (!std::isfinite(duration) || duration <= 0.0 || !std::isfinite(interval) || interval <= 0.0)
		throw std::logic_error("Invalid duration while advancing sequence");

	const double nextTime = state.time + interval;
	ChannelState nextState;
	nextState.channelId = state.channelId;

	if (loop)
	{
		double timestamp = std::fmod(nextTime, duration);
		if (timestamp < 0.0)
			timestamp += duration;
		nextState.time = nextTime;
		sequence->GetState(timestamp, nextState);
		heap.back() = nextState;
		std::push_heap(heap.begin(), heap.end());
	}
	else if (nextTime < duration)
	{
		nextState.time = nextTime;
		sequence->GetState(nextTime, nextState);
		heap.back() = nextState;
		std::push_heap(heap.begin(), heap.end());
	}
	else if (state.output)
	{
		// Return every scheduled on-state, then emit an explicit off-state at
		// the sequence boundary. This avoids truncating the final program step.
		nextState = state;
		nextState.time = duration;
		nextState.output = false;
		nextState.amplitude = 0.0;
		nextState.frequency = 0.0;
		nextState.waveform = BuiltinWaveform::unknown;
		nextState.stepDuration = 0.0;
		heap.back() = nextState;
		std::push_heap(heap.begin(), heap.end());
	}
	else
	{
		heap.pop_back();
	}

	return true;
}

double S2::MultiChannelSequence::Duration() const
{
	double m = 0.0;
	for(const auto & i : sequences)
		m = std::max(m, i.second->Duration());
	return m;
}

S2::ChannelInUse::ChannelInUse(ChannelId channel) : std::runtime_error("The specified channel is already used"), channel(channel)
{
}

std::shared_ptr<S2::Sequence> S2::Chain(const std::shared_ptr<Sequence> &s1, const std::shared_ptr<Sequence> &s2)
{
	return std::make_shared<ChainedSequence>(s1, s2);
}

S2::ChainedSequence::ChainedSequence(const std::shared_ptr<Sequence> s1, const std::shared_ptr<Sequence> &s2) : s1(s1), s2(s2)
{
}

double S2::ChainedSequence::Duration() const
{
	return s1->Duration() + s2->Duration();
}

void S2::ChainedSequence::GetState(double time, ChannelState & state) const
{
	double t1 = s1->Duration();
	return time < t1 ? s1->GetState(time, state) : s2->GetState(time-t1, state);
}

class Validator : public S2::DatabaseVisitor
{
public:
	explicit Validator(const S2::Options &options) : options(options), validRecords(0), errors(0)
	{
	}

	const S2::Options &options;
	int validRecords;
	int errors;

	void DatabaseRow(int rowId, const std::string &line)
	{
		try
		{
			S2::DatabaseProgram program(options, line);
			const double duration = program.Duration();
			if (!std::isfinite(duration) || duration <= 0.0)
				throw S2::IOError("Program duration must be finite and positive");
			++validRecords;
		}
		catch (const std::exception &error)
		{
			++errors;
			std::cerr << options.DataFile("programs.csv") << ":" << rowId << ": "
				<< error.what() << std::endl;
		}
	}
};

int S2::ValidateDatabase(const Options &options)
{
	Database database;
	Validator validator(options);
	try
	{
		database.VisitDataFiles(options, validator);
	}
	catch (const std::exception &error)
	{
		std::cerr << error.what() << std::endl;
		return 1;
	}

	if (validator.errors != 0)
	{
		std::cerr << "Database validation failed: " << validator.errors
			<< " invalid record(s); " << validator.validRecords << " valid record(s)." << std::endl;
		return 1;
	}

	std::cout << "Validated " << validator.validRecords << " program record(s)." << std::endl;
	return 0;
}

S2::SyntaxError::SyntaxError(const char *) : std::runtime_error("Invalid program format")
{
}

S2::SyntaxError::SyntaxError(const char *, const char * reason) : std::runtime_error(reason)
{
}

