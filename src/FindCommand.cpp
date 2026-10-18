#include "S2.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <iostream>

namespace
{
	bool contains(const std::string &search, const char *pattern, const char *patternEnd)
	{
		return std::search(search.begin(), search.end(), pattern, patternEnd,
			[](char left, char right) {
				return std::toupper(static_cast<unsigned char>(left)) ==
					std::toupper(static_cast<unsigned char>(right));
			}) != search.end();
	}

	bool contains(const std::string &search, double target)
	{
		for (const char *position = search.c_str(), *end = position + search.length(); position < end; ++position)
		{
			if (std::isdigit(static_cast<unsigned char>(*position)))
			{
				char *numberEnd = nullptr;
				const double value = std::strtod(position, &numberEnd);
				if (numberEnd == position)
					continue;
				position = numberEnd;
				if (value > target * 0.99 && value < target * 1.01)
					return true;
			}
		}
		return false;
	}

	template<typename Callback>
	class ProgramRowVisitor : public S2::DatabaseVisitor
	{
	public:
		explicit ProgramRowVisitor(const Callback &callback) : callback(callback)
		{
		}

		void DatabaseRow(int rowId, const std::string &row)
		{
			callback(rowId, row);
		}

	private:
		Callback callback;
	};

	template<typename Callback>
	void VisitPrograms(const S2::Options &options, const Callback &callback)
	{
		S2::Database database;
		ProgramRowVisitor<Callback> visitor(callback);
		database.VisitDataFiles(options, visitor);
	}
}

class FindOptions : public S2::OptionsVisitor
{
public:
	explicit FindOptions(const S2::Options &options) : options(options)
	{
	}

	void Name(const char *name)
	{
		const char *nameEnd = name + std::strlen(name);
		VisitPrograms(options, [&](int id, const std::string &line) {
			if (!contains(line, name, nameEnd))
				return;

			try
			{
				const S2::DatabaseProgram program(options, line);
				std::cout << id << ": " << program.name << " (" << program.dataset << ") "
					<< program.durationMinutes << " mins" << std::endl;
			}
			catch (const std::exception &error)
			{
				throw S2::IOError(options.DataFile("programs.csv") + ":" + std::to_string(id) + ": " + error.what());
			}
		});
	}

	void Frequency(double frequency)
	{
		VisitPrograms(options, [&](int id, const std::string &line) {
			if (!contains(line, frequency))
				return;

			try
			{
				const S2::DatabaseProgram program(options, line);
				std::cout << id << ": " << program.name << " (" << program.dataset << ") "
					<< program.durationMinutes << " mins" << std::endl;
				std::cout << program.code << std::endl;
			}
			catch (const std::exception &error)
			{
				throw S2::IOError(options.DataFile("programs.csv") + ":" + std::to_string(id) + ": " + error.what());
			}
		});
	}

private:
	const S2::Options &options;
};

int S2::FindCommand(const Options &options, ProgressMonitor &)
{
	FindOptions find(options);
	options.Visit(find);
	return 0;
}
