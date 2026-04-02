"""Tests — Domain enforcement and security guards"""

import pytest
from core.security import enforce_allowed_domain
from core.exceptions import ForbiddenError


def test_allowed_domain_passes():
    enforce_allowed_domain("shreya@agilityai.in")  # should not raise


def test_blocked_domain_raises():
    with pytest.raises(ForbiddenError):
        enforce_allowed_domain("attacker@gmail.com")


def test_blocked_domain_outlook():
    with pytest.raises(ForbiddenError):
        enforce_allowed_domain("user@outlook.com")


def test_subdomain_blocked():
    with pytest.raises(ForbiddenError):
        enforce_allowed_domain("user@mail.agilityai.in")


def test_case_insensitive_domain():
    enforce_allowed_domain("User@AGILITYAI.IN")  # should not raise
