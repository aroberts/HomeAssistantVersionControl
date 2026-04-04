# Changelog

## [1.2.0]

### Added
- **Track UI-configured Settings:** Added `include_storage` to track things you set up through the Home Assistant interface (like Areas, Persons, and Zones) that are normally hidden from version control.
- **Additional Paths Tracking:** Added `additional_paths` option to track files outside `/config` (including mapped paths like `/share` and `/media`) while syncing them into version control.
- **Remote URL Configuration:** Added `remote_url` option to the addon configuration to allow easily changing the remote repository URL from the Home Assistant UI.
- **Smart SSH Key Loader:** Persistently load SSH keys from `/config/.ssh` into the addon environment.
- **Trusted CA Certificates:** Automatically sync and trust root CA certificates from `/config/additional_ca` for secure connections to private Git remotes.
- **Confetti Mode:** Added a toggle to celebrate successful restores with a realistic, physics-based confetti animation.
- **Max Commits Setting:** Added UI to configure the maximum number of commits retained in history.
- **Resizable Panels:** The side and main panels can now be resized by dragging the gap between them.
- **Header Palette Cycle:** Clicking the header title or logo now cycles through available accent color palettes.

### Fixed
- **Dynamic File Formats:** Fixed issue where `.py`, `.json`, and `.txt` formats were hardcoded to `false` in `server.js`, ignoring the `include_extensions` configuration.
- **Default Branch Transition:** New repositories now default to `main` (standard Git naming). Existing repositories on `master` or other branches are detected automatically and supported without intervention.
- **Cloud Sync Branch:** Improved dynamic detection to ensure sync always follows the active local branch.
- **Storage File UX:** `include_storage` entries now appear in Files/history and participate in restore/filter flows exactly as configured (not limited to `lovelace*` files).
- **UI Refinement:** Re-ordered settings menu for better logical flow (Max Commits moved below history retention).
- **Timeline Path Display:** Fixed issue where file paths in the timeline tab were showing the `.havc_external/` prefix for additional paths.
- **Files Tab External Path Display:** External mirrored paths now render as virtual `/share/...` and `/media/...` paths, with top-level `share` and `media` folders shown directly instead of `.havc_external`.
- **Documentation:** Fixed Docker image name typo in README.
- **Automation Diff Line Numbers:** Corrected line number synchronization in automation and script diff views when comparing isolated YAML content. Diffs now always start at line 1, preventing offsets during history browsing and after file deletions.

## [1.1.1]

### Fixed
- Fixed issue with `secrets.yaml` exclusion in cloud sync

## [1.1.0]

### Added
- **Cloud Backup:** Push your configuration to a private GitHub or Gitea repository. Choose to sync manually, daily, or automatically after every change.
- **Track More than Just YAML:** Now you can select any file format to track and backup! Configure extensions like .sh, .py, .json directly in the add-on's Configuration tab.
- **Recover Deleted Items:** View and restore files, automations, and scripts that have been deleted. Look for the "Deleted" option in the sort menu.
- **Progressive History Loading:** Versions now load faster, displaying results as they're found.
- **Quick Style Toggle:** Tap the header bar of any file diff to cycle through different visual themes instantly.