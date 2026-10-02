#!/bin/bash
# Rebuild the working environment from scratch (~3 min): python venv, source mesh data, SolidArc console.
H=$HOME
[ -x $H/.venv/bin/python ] || { python3 -m venv $H/.venv && $H/.venv/bin/pip install -q numpy scipy matplotlib pillow numba; }
[ -d $H/src_frontier ] || git clone -q --depth 1 -b arena/01a0fc96-frontier https://github.com/streamlinkinbox/Frontier $H/src_frontier
if [ ! -x $H/.solidarc/build/SolidArc ]; then
  mkdir -p $H/.solidarc/build
  [ -d $H/.solidarc/src/.git ] || { git clone -q --filter=blob:none --sparse --depth 1 https://github.com/SultanAladin/Frontier-.git $H/.solidarc/src; (cd $H/.solidarc/src && git sparse-checkout set Editor/AuthoringTools/Modelling/SolidArc); }
  cd $H/.solidarc/src/Editor/AuthoringTools/Modelling/SolidArc
  SRCS=$(grep -o "Kernel/[A-Za-z]*.cpp\|Presentation/[A-Za-z]*.cpp\|Interaction/[A-Za-z]*.cpp\|Document/[A-Za-z]*.cpp\|Console/[A-Za-z]*.cpp" $H/src_frontier/Vehicles/tools/setup_env.sh | sort -u | tr "\n" " ")
  for f in $SRCS; do g++ -std=c++20 -O2 -w -I. -IPresentation -DSOLIDARC_PROOF_FOLDER="\"$H/.solidarc/build/Proofs\"" -c $f -o $H/.solidarc/build/$(echo $f | tr / _).o & done; wait
  g++ -O2 $H/.solidarc/build/*.o -o $H/.solidarc/build/SolidArc -lpthread
fi
echo SETUP_OK
