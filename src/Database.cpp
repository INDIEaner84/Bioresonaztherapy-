#include "S2.h"

#include <cerrno>
#include <cmath>
#include <cstdlib>
#include <fstream>

namespace
{
	bool CsvRecordComplete(const std::string &record)
	{
		bool inQuotes = false;
		bool atFieldStart = true;
		for (std::string::size_type index = 0; index < record.size(); ++index)
		{
			const char value = record[index];
			if (inQuotes)
			{
				if (value == '\\' && index + 1 < record.size() && record[index + 1] == '"')
				{
					++index;
					continue;
				}
				if (value == '"')
				{
					if (index + 1 < record.size() && record[index + 1] == '"')
						++index;
					else
						inQuotes = false;
				}
				continue;
			}

			if (value == ',')
				atFieldStart = true;
			else
			{
				if (value == '"' && atFieldStart)
					inQuotes = true;
				atFieldStart = false;
			}
		}
		return !inQuotes;
	}

	std::string CsvColumnError(std::size_t column, const std::string &reason)
	{
		return std::string("Malformed programs.csv column ") + std::to_string(column) + ": " + reason;
	}

	std::vector<std::string> ParseCsvRow(const std::string &input)
	{
		std::string row(input);
		if (!row.empty() && row[row.size() - 1] == '\n')
		{
			row.erase(row.size() - 1);
			if (!row.empty() && row[row.size() - 1] == '\r')
				row.erase(row.size() - 1);
		}
		else if (!row.empty() && row[row.size() - 1] == '\r')
			row.erase(row.size() - 1);

		std::vector<std::string> fields;
		std::string::size_type position = 0;
		while (true)
		{
			const std::size_t column = fields.size() + 1;
			std::string field;

			if (position < row.size() && row[position] == '"')
			{
				++position;
				bool closed = false;
				while (position < row.size())
				{
					const char value = row[position];
					if (value == '\\' && position + 1 < row.size() && row[position + 1] == '"')
					{
						// Preserve the legacy backslash-escaped form literally.
						field.push_back(value);
						field.push_back(row[position + 1]);
						position += 2;
						continue;
					}
					if (value == '"')
					{
						if (position + 1 < row.size() && row[position + 1] == '"')
						{
						field.push_back('"');
						position += 2;
						continue;
					}
					++position;
					closed = true;
					break;
				}
					field.push_back(value);
					++position;
				}

				if (!closed)
					throw S2::IOError(CsvColumnError(column, "unterminated quoted field"));
				if (position < row.size() && row[position] != ',')
					throw S2::IOError(CsvColumnError(column, "expected a comma after the closing quote"));
			}
			else
			{
				while (position < row.size() && row[position] != ',')
				{
					if (row[position] == '"')
						throw S2::IOError(CsvColumnError(column, "quote in an unquoted field"));
					field.push_back(row[position]);
					++position;
				}
			}

			fields.push_back(field);
			if (position == row.size())
				break;

			++position; // comma separator
			if (position == row.size())
			{
				fields.push_back(std::string());
				break;
			}
		}

		if (fields.size() < 8)
			throw S2::IOError(CsvColumnError(fields.size() + 1,
				"missing field (expected at least 8 columns, found " + std::to_string(fields.size()) + ")"));
		return fields;
	}

	double ParseDatabaseNumber(const std::string &field, std::size_t column, const char *name)
	{
		const std::string::size_type first = field.find_first_not_of(" \t");
		if (first == std::string::npos)
			return 0.0; // Preserve the legacy interpretation of an empty numeric cell.

		errno = 0;
		char *end = nullptr;
		const double value = std::strtod(field.c_str() + first, &end);
		if (end == field.c_str() + first || errno == ERANGE || !std::isfinite(value))
			throw S2::IOError(CsvColumnError(column, std::string("invalid numeric value for ") + name));
		while (*end == ' ' || *end == '\t')
			++end;
		if (*end != '\0')
			throw S2::IOError(CsvColumnError(column, std::string("unexpected characters in ") + name));
		return value;
	}
}

S2::Database::Database()
{
}

void S2::Database::VisitDataFiles(const Options &options, DatabaseVisitor &visitor) const
{
	int rowId = 1;
	// TODO: Locate other data files as well.
	visitor.DatabaseFile(rowId, options.DataFile("programs.csv"));
}

void S2::DatabaseVisitor::DatabaseFile(int &rowId, const std::string &filename)
{
	std::ifstream file(filename.c_str());
	if (!file)
		throw S2::IOError("Could not open program database: " + filename);
	try
	{
		DatabaseFile(rowId, file);
	}
	catch (...)
	{
		if (file.bad() || (file.fail() && !file.eof()))
			throw S2::IOError("Could not read program database: " + filename);
		throw;
	}
}

void S2::DatabaseVisitor::DatabaseFile(int &rowId, std::istream &file)
{
	if (!file)
		throw S2::IOError("Cannot read program database stream");

	std::string line;
	std::string record;
	int recordStartRow = rowId;
	while (std::getline(file, line))
	{
		const int currentRow = rowId++;
		if (record.empty())
		{
			if (line.find_first_not_of(" \t\r") == std::string::npos)
				continue;
			recordStartRow = currentRow;
			record = line;
		}
		else
		{
			record += '\n';
			record += line;
		}

		if (!CsvRecordComplete(record))
			continue;
		DatabaseRow(recordStartRow, record);
		record.clear();
	}

	if (file.bad() || (file.fail() && !file.eof()))
		throw S2::IOError("I/O error while reading program database stream");

	// Let the CSV parser report an unterminated quoted record with its start row.
	if (!record.empty())
		DatabaseRow(recordStartRow, record);
}

void S2::DatabaseVisitor::DatabaseRow(int, const std::string &)
{
}

S2::DatabaseProgram::DatabaseProgram(const Options &options, const std::string &row) : Code(options)
{
	const std::vector<std::string> fields = ParseCsvRow(row);
	name = fields[0];
	dataset = fields[1];
	durationMinutes = ParseDatabaseNumber(fields[2], 3, "duration");
	description = fields[3];
	code = fields[4];
	organ = fields[5];
	disease = fields[6];
	stepSize = ParseDatabaseNumber(fields[7], 8, "step size");
}

std::pair<const char *, const char *> S2::DatabaseProgram::GetCode() const
{
	return std::make_pair(code.c_str(), code.c_str() + code.length());
}

S2::Code::Code(const Options &options) : options(options)
{
}
