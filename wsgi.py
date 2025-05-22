#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""WSGI entry point for production deployment with Gunicorn."""

from app import app, init_db

# Initialize database when WSGI app starts
init_db()

if __name__ == "__main__":
    app.run()
