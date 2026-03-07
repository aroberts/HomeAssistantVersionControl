# Contributing to Home Assistant Version Control

Thanks for your interest in contributing!

## Where to Submit PRs

| Type of Change | Target Branch |
|----------------|---------------|
| **All changes** | `develop` |
| **Documentation** | `develop` |

### How to Change PR Target

When creating a PR, use the "base" dropdown to select `develop`.

If you've already created a PR targeting another branch, you can change it by clicking "Edit" next to the base branch on the PR page.

## Development Workflow

1. Fork the repository
2. Create a feature branch from `develop`
3. Make your changes
4. Submit a PR targeting `develop`
5. Your changes will be tested and then merged to `develop` for releases

## Release Process

| **Release** | `develop` | `latest` | `ha-addons` |

- **For Release:** Push to or merge into `develop`, then create a **GitHub Release** on `develop`. This will tag the image with the version number and update `latest`.

## Questions?

Open an issue if you're unsure where your contribution should go!
