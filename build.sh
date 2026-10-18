#!/bin/sh
set -eu

mkdir -p build
cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . --target s2 --config Release -- -j2
