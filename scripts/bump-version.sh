#!/bin/bash
title=$1

echo $title

if [[ $title == *"feature"* ]]; then
  echo "Bumping minor"
  npm version minor
elif [[ $title == *"major"* ]]; then
  echo "Bumping major"
  npm version major
else
  echo "Bumping patch"
  npm version patch
fi
