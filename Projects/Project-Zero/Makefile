# Project-Zero headless CPU reference (sandbox stand-in; the product renderer is the
# Vulkan + Slang stack built by Build/ToolchainSequence.ps1). Explicit file list:
# never glob Source/ — GameExecution.cpp (the Vulkan entry point) lives there.
CXX      := g++
CXXFLAGS := -std=c++20 -O2 -Wall -Wextra -I../../ExternalPackages/vulkan-headers/include
TARGET   := bin/Project-Zero-CpuReference
PATHTOOL := bin/Project-Zero-PathCompare
GITOOL   := bin/Project-Zero-SdfGiPipeline
OBJDIR   := build/cpu
PATHOBJ  := build/path
GIOBJ    := build/gi

SRCS := \
	Source/CpuReferenceMain.cpp \
	Source/RendererHost.cpp \
	Source/RayTracingSolver.cpp \
	Source/SkyFogIntegrator.cpp \
	../../Engine/GeometricRaster/CameraProjection.cpp \
	../../Engine/DeviceExchange/OrientationClassifier.cpp \
	../../Engine/DeviceExchange/DiagnosticMetrics.cpp

# PathCompare renders the same scene through raster / SDF-GI / reference and diffs them.
PATHSRCS := \
	Source/PathCompareMain.cpp \
	Source/RayTracingSolver.cpp \
	../../Engine/GeometricRaster/CameraProjection.cpp \
	../../Engine/GeometricRaster/DistanceAtlasSpace.cpp \
	../../Engine/GeometricRaster/DistanceFieldStructure.cpp \
	../../Engine/DeviceExchange/OrientationClassifier.cpp

# SdfGiPipeline is the faithful CPU mirror of the four-pass Distance Field GI pipeline
# (capture -> radiance -> gather -> resolve). It is the one that shows the field is dynamic.
GISRCS := \
	Source/SdfGiPipelineMain.cpp \
	../../Engine/GeometricRaster/DistanceAtlasSpace.cpp \
	../../Engine/DeviceExchange/OrientationClassifier.cpp

OBJS := $(addprefix $(OBJDIR)/,$(notdir $(SRCS:.cpp=.o)))
PATHOBJS := $(addprefix $(PATHOBJ)/,$(notdir $(PATHSRCS:.cpp=.o)))
GIOBJS := $(addprefix $(GIOBJ)/,$(notdir $(GISRCS:.cpp=.o)))

vpath %.cpp Source ../../Engine/GeometricRaster ../../Engine/DeviceExchange

.PHONY: all clean run paths sdfgi

all: $(TARGET) $(PATHTOOL) $(GITOOL)

paths: $(PATHTOOL)

sdfgi: $(GITOOL)

$(GITOOL): $(GIOBJS)
	@mkdir -p bin
	$(CXX) $(CXXFLAGS) -o $@ $^ -lpthread

$(GIOBJ)/%.o: %.cpp | $(GIOBJ)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(GIOBJ):
	@mkdir -p $(GIOBJ)

$(PATHTOOL): $(PATHOBJS)
	@mkdir -p bin
	$(CXX) $(CXXFLAGS) -o $@ $^ -lpthread

$(PATHOBJ)/%.o: %.cpp | $(PATHOBJ)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(PATHOBJ):
	@mkdir -p $(PATHOBJ)

$(TARGET): $(OBJS)
	@mkdir -p bin
	$(CXX) $(CXXFLAGS) -o $@ $^

$(OBJDIR)/%.o: %.cpp | $(OBJDIR)
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(OBJDIR):
	@mkdir -p $(OBJDIR)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -rf $(OBJDIR) $(TARGET) $(PATHOBJ) $(PATHTOOL) $(GIOBJ) $(GITOOL)
