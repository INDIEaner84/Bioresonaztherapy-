cmake_minimum_required(VERSION 3.10)
project(s2)

find_package(Threads REQUIRED)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(WIN32)
	set(PLATFORM_CPP src/Win32.cpp)
elseif(APPLE)
	find_library(IOKit IOKit)
	find_library(CoreFoundation CoreFoundation)
	set(PLATFORM_CPP src/Apple.cpp src/Posix.cpp)
	set(PLATFORM_LIBRARIES ${IOKit} ${CoreFoundation})
else()
	set(PLATFORM_CPP src/Linux.cpp src/Posix.cpp)
endif()

add_library(s2core STATIC
	src/Control.cpp
	src/Database.h
	src/Database.cpp
	src/Devices.h
	src/Devices.cpp
	src/Device.h
	src/FindCommand.cpp
	src/Generator.cpp
	src/Generator.h
	src/Interrupt.cpp
	src/Interrupt.h
	src/Options.h
	src/Options.cpp
	src/OutputSafety.cpp
	src/Posix.h
	src/OutputSafety.h
	src/Preset.cpp
	src/Preset.h
	src/Program.h
	src/Program.cpp
	src/ProgressMonitor.h
	src/ProgressMonitor.cpp
	src/Pulse.cpp
	src/Pulse.h
	src/RunCommand.cpp
	src/S2.h
	src/Scan.cpp
	src/SetCommand.cpp
	src/Waveforms.cpp
	src/Waveforms.h
	${PLATFORM_CPP}
)

target_include_directories(s2core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(s2core PUBLIC Threads::Threads)
if(PLATFORM_LIBRARIES)
	target_link_libraries(s2core PUBLIC ${PLATFORM_LIBRARIES})
endif()

if(MSVC)
	target_compile_options(s2core PRIVATE /W4)
else()
	target_compile_options(s2core PRIVATE -Wall -Wextra -Wpedantic)
endif()

add_executable(s2 cmdline/Main.cpp)
target_link_libraries(s2 PRIVATE s2core)

install(TARGETS s2 RUNTIME DESTINATION bin)

include(CTest)
if(BUILD_TESTING)
	add_executable(unittests
		tests/Tests.cpp
		tests/Options.cpp
		tests/Tests.h
	)
	target_link_libraries(unittests PRIVATE s2core)
	add_test(NAME unit-tests COMMAND unittests)
endif()
