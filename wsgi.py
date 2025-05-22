#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""WSGI entry point for production deployment with Gunicorn."""

from app import app
import sys

# We no longer initialize the database here
# Database initialization is now handled by init_schema.py via start.sh
print("WSGI app initialization - using pre-initialized database")

if __name__ == "__main__":
    app.run()
