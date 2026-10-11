# Project-Zero headless CPU reference (sandbox stand-in; the product renderer is the
# Vulkan + Slang stack built by Build/ToolchainSequence.ps1). Explicit file list:
# never glob Source/ — GameExecution.cpp (the Vulkan entry point) lives there.
CXX      := g++
CXXFLAGS := -std=c++20 -O2 -Wall -Wextra -I../../ExternalPackages/vulkan-headers/include
TARGET   := bin/Project-Zero-CpuReference
PATHTOOL := bin/Project-Zero-PathCompare
OBJDIR   := build/cpu
PATHOBJ  := build/path

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

OBJS := $(addprefix $(OBJDIR)/,$(notdir $(SRCS:.cpp=.o)))
PATHOBJS := $(addprefix $(PATHOBJ)/,$(notdir $(PATHSRCS:.cpp=.o)))

vpath %.cpp Source ../../Engine/GeometricRaster ../../Engine/DeviceExchange

.PHONY: all clean run paths

all: $(TARGET) $(PATHTOOL)

paths: $(PATHTOOL)

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
	rm -rf $(OBJDIR) $(TARGET) $(PATHOBJ) $(PATHTOOL)
