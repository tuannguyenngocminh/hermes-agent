//! First-install setup for Super Agent's source-profile conversation.
//!
//! The bundled workflow remains owned by the app source.  We copy it into the
//! newly installed Hermes home so the local agent discovers it through its
//! normal skills directory; no repository-level skill or runtime plugin loader
//! is involved.

use std::io::Write;
use std::path::{Path, PathBuf};

const PROFILE_SOURCE_SKILL: &str = include_str!("../../../desktop/assets/super-agent-workflows/profile-source-v4/SKILL.md");

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "profile source path has no parent".to_string())?;
    std::fs::create_dir_all(parent).map_err(|err| format!("create profile source directory: {err}"))?;
    let temp = path.with_extension("tmp");
    let mut file = std::fs::File::create(&temp).map_err(|err| format!("create profile source temp file: {err}"))?;
    file.write_all(contents.as_bytes()).map_err(|err| format!("write profile source temp file: {err}"))?;
    file.sync_all().map_err(|err| format!("flush profile source temp file: {err}"))?;
    drop(file);
    std::fs::rename(&temp, path).map_err(|err| format!("publish profile source file: {err}"))
}

/// Turn off upstream's one-time profile builder without replacing unrelated
/// user configuration.  The installer only handles the ordinary block-map
/// shape it creates itself; an unfamiliar `onboarding:` shape is left intact
/// and reported instead of risking a corrupt config.yaml.
fn disable_upstream_profile_build(config_path: &Path) -> Result<(), String> {
    let original = if config_path.exists() {
        std::fs::read_to_string(config_path).map_err(|err| format!("read existing config.yaml: {err}"))?
    } else {
        String::new()
    };

    let mut lines: Vec<String> = original.lines().map(str::to_owned).collect();
    let onboarding = lines.iter().position(|line| !line.trim_start().starts_with('#') && line.trim_start().starts_with("onboarding:"));

    match onboarding {
        None => {
            if !lines.is_empty() && !lines.last().is_some_and(|line| line.is_empty()) {
                lines.push(String::new());
            }
            lines.push("onboarding:".into());
            lines.push("  profile_build: off".into());
        }
        Some(start) => {
            let value = lines[start].trim_start().strip_prefix("onboarding:").unwrap_or("").split('#').next().unwrap_or("").trim();
            if value == "{}" {
                lines[start] = "onboarding:".into();
            } else if !value.is_empty() {
                return Err("existing config.yaml uses an unsupported onboarding shape; it was left unchanged".into());
            }
            let end = lines.iter().enumerate().skip(start + 1).find_map(|(index, line)| {
                let trimmed = line.trim();
                (!trimmed.is_empty() && !line.starts_with(' ') && !line.starts_with('\t') && !line.starts_with('#')).then_some(index)
            }).unwrap_or(lines.len());
            if let Some(profile_build) = (start + 1..end).find(|index| lines[*index].trim_start().starts_with("profile_build:")) {
                let indent = lines[profile_build].chars().take_while(|ch| ch.is_whitespace()).collect::<String>();
                lines[profile_build] = format!("{indent}profile_build: off");
            } else {
                lines.insert(end, "  profile_build: off".into());
            }
        }
    }

    let next = format!("{}\n", lines.join("\n"));
    if next != original {
        write_atomic(config_path, &next)?;
    }
    Ok(())
}

pub fn install_profile_source_setup(hermes_home: &Path) -> Result<PathBuf, String> {
    let skill_path = hermes_home.join("skills").join("super-agent").join("profile-source-v4").join("SKILL.md");
    if !skill_path.exists() {
        write_atomic(&skill_path, PROFILE_SOURCE_SKILL)?;
    }
    disable_upstream_profile_build(&hermes_home.join("config.yaml"))?;
    Ok(skill_path)
}

#[cfg(test)]
mod tests {
    use super::install_profile_source_setup;

    fn temp_root(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("hermes-profile-source-{name}-{}", std::process::id()))
    }

    #[test]
    fn installs_bundled_workflow_and_disables_only_upstream_profile_builder() {
        let root = temp_root("fresh");
        let path = install_profile_source_setup(&root).expect("setup succeeds");
        let skill = std::fs::read_to_string(path).expect("workflow was written");
        let config = std::fs::read_to_string(root.join("config.yaml")).expect("config was written");
        assert!(skill.contains("Hồ sơ nguồn"));
        assert_eq!(config, "onboarding:\n  profile_build: off\n");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn preserves_existing_config_and_existing_bundled_workflow() {
        let root = temp_root("existing");
        std::fs::create_dir_all(root.join("skills/super-agent/profile-source-v4")).expect("skill directory");
        std::fs::write(root.join("skills/super-agent/profile-source-v4/SKILL.md"), "kept").expect("existing workflow");
        std::fs::write(root.join("config.yaml"), "model:\n  provider: openai\nonboarding:\n  seen: true\n").expect("existing config");
        install_profile_source_setup(&root).expect("setup succeeds");
        assert_eq!(std::fs::read_to_string(root.join("skills/super-agent/profile-source-v4/SKILL.md")).unwrap(), "kept");
        assert_eq!(std::fs::read_to_string(root.join("config.yaml")).unwrap(), "model:\n  provider: openai\nonboarding:\n  seen: true\n  profile_build: off\n");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_an_unfamiliar_onboarding_shape_without_replacing_config() {
        let root = temp_root("unsupported");
        std::fs::create_dir_all(&root).expect("root");
        let config = root.join("config.yaml");
        std::fs::write(&config, "onboarding: ask\n").expect("existing config");
        let result = install_profile_source_setup(&root);
        assert!(result.is_err());
        assert_eq!(std::fs::read_to_string(config).unwrap(), "onboarding: ask\n");
        let _ = std::fs::remove_dir_all(root);
    }
}
