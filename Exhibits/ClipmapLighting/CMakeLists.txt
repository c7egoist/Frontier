cmake_minimum_required(VERSION 3.20)
project(FrontierClipmapLightingProof LANGUAGES CXX)

add_executable(ClipmapLightingValidation
    ClipmapLightingValidation.cpp
    ../../Engine/DistanceFieldSpace/ClipmapSurfaceCache.cpp)

target_include_directories(ClipmapLightingValidation PRIVATE ../..)
target_compile_features(ClipmapLightingValidation PRIVATE cxx_std_20)

if(MSVC)
    target_compile_options(ClipmapLightingValidation PRIVATE /W4 /permissive-)
else()
    target_compile_options(ClipmapLightingValidation PRIVATE -Wall -Wextra -Wpedantic)
endif()
