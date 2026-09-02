#!/usr/bin/env python3
# ============================================================
# test_toml_parsing.py - Validate TOML parsing for training detection
# ============================================================

import os
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    try:
        import tomli as tomllib
    except ImportError:
        print("ERROR: Install tomli for Python <3.11: pip install tomli")
        sys.exit(1)


SAMPLE_DIR = Path(__file__).parent / "sample_configs"

REQUIRED_FIELDS = {
    "output_name": str,
    "pretrained_model_name_or_path": str,
    "resolution": (str, int, list),
    "train_batch_size": int,
    "learning_rate": float,
    "output_dir": str,
    "logging_dir": str,
}

OPTIONAL_FIELDS = {
    "max_train_epochs": int,
    "max_train_steps": int,
    "lr_scheduler": str,
    "optimizer_type": str,
    "network_module": str,
    "network_dim": int,
    "network_alpha": (int, float),
    "mixed_precision": str,
    "seed": int,
    "train_data_dir": str,
    "dataset_config": str,
    "gradient_checkpointing": bool,
    "caption_extension": str,
}


def _is_dataset_config(config: dict) -> bool:
    return "datasets" in config and "output_name" not in config


def _validate_standard_training_config(config: dict) -> tuple[list[str], list[str], str, str]:
    errors: list[str] = []
    warnings: list[str] = []

    for key, expected_type in REQUIRED_FIELDS.items():
        allowed = expected_type if isinstance(expected_type, tuple) else (expected_type,)
        if key not in config:
            errors.append(f"Missing required field: '{key}'")
        elif not isinstance(config[key], allowed):
            actual = type(config[key]).__name__
            expected = "/".join(t.__name__ for t in allowed)
            errors.append(f"'{key}' expected {expected}, got {actual} (value: {config[key]!r})")

    for key, expected_type in OPTIONAL_FIELDS.items():
        allowed = expected_type if isinstance(expected_type, tuple) else (expected_type,)
        if key in config and not isinstance(config[key], allowed):
            actual = type(config[key]).__name__
            expected = "/".join(t.__name__ for t in allowed)
            warnings.append(f"'{key}' type mismatch: expected {expected}, got {actual}")

    tool = "unknown"
    training_type = "unknown"
    network_module = str(config.get("network_module", ""))
    if network_module:
        if "lora_flux" in network_module:
            tool, training_type = "kohya", "kohya-lora (FLUX)"
        elif "lora_wan" in network_module:
            tool, training_type = "musubi", "musubi-video (Wan2.1)"
        elif "lora" in network_module:
            tool, training_type = "kohya", "kohya-lora"
    else:
        tool, training_type = "kohya", "kohya-dreambooth"

    return errors, warnings, tool, training_type


def _validate_dataset_config(config: dict) -> tuple[list[str], list[str], str, str]:
    errors: list[str] = []
    warnings: list[str] = []

    general = config.get("general")
    if not isinstance(general, dict):
        errors.append("Missing or invalid [general] section")

    datasets = config.get("datasets")
    if not isinstance(datasets, list) or len(datasets) == 0:
        errors.append("Missing or invalid [[datasets]] entries")
    else:
        for i, dataset in enumerate(datasets):
            if not isinstance(dataset, dict):
                errors.append(f"datasets[{i}] should be a table")
                continue
            if "video_directory" not in dataset:
                errors.append(f"datasets[{i}] missing 'video_directory'")

    return errors, warnings, "musubi", "dataset-config"


# ============================================================================
# Pytest compatibility: parametrize over sample configs
# ============================================================================

import pytest

TEST_CONFIGS = sorted(SAMPLE_DIR.glob("*.toml"))


def validate_toml_file(filepath: Path) -> tuple[bool, list[str]]:
    """Validate one TOML config; shared by the pytest entry and the standalone runner."""
    try:
        with open(filepath, "rb") as f:
            config = tomllib.load(f)
    except Exception as e:
        return False, [f"Failed to parse TOML: {e}"]

    if _is_dataset_config(config):
        errors, warnings, tool, training_type = _validate_dataset_config(config)
    else:
        errors, warnings, tool, training_type = _validate_standard_training_config(config)

    messages = errors + warnings + [f"Detected: tool={tool}, type={training_type}"]
    return len(errors) == 0, messages


@pytest.mark.parametrize("filepath", TEST_CONFIGS)
def test_toml_file(filepath: Path):
    """Every sample config must validate cleanly — this must fail on validation errors."""
    ok, messages = validate_toml_file(filepath)
    assert ok, "\n".join(messages)


def simulate_job_build(filepath: Path) -> dict:
    with open(filepath, "rb") as f:
        config = tomllib.load(f)

    if _is_dataset_config(config):
        first_dataset = (config.get("datasets") or [{}])[0]
        dataset_dir = first_dataset.get("video_directory", "")
        return {
            "id": "MOCK-PID-12345",
            "name": "musubi_dataset_config",
            "type": "musubi-video",
            "tool": "musubi",
            "status": "running",
            "progress": 0,
            "currentEpoch": 0,
            "totalEpochs": 0,
            "currentStep": 0,
            "totalSteps": 0,
            "currentLoss": 0.0,
            "lossHistory": [],
            "learningRate": 0,
            "batchSize": int(config.get("general", {}).get("batch_size", 1)),
            "resolution": str(config.get("general", {}).get("resolution", "unknown")),
            "model": "unknown",
            "dataset": os.path.basename(dataset_dir) if dataset_dir else "unknown",
            "outputPath": "",
            "configPath": str(filepath),
            "tensorboardLogDir": "",
            "startTime": "2026-02-25T10:00:00",
            "estimatedTimeRemaining": "calculating...",
            "gpuUtilization": 0,
            "vramUsed": 0,
            "dataSource": "config-file",
        }

    resolution = config.get("resolution", "unknown")
    if isinstance(resolution, list):
        resolution = "x".join(str(r) for r in resolution)

    model_path = config.get("pretrained_model_name_or_path", "")
    model_name = os.path.basename(model_path) if model_path else "unknown"

    train_data = config.get("train_data_dir", config.get("dataset_config", ""))
    dataset_name = os.path.basename(train_data) if train_data else "unknown"

    return {
        "id": "MOCK-PID-12345",
        "name": config.get("output_name", "Unknown"),
        "type": "lora",
        "tool": "kohya",
        "status": "running",
        "progress": 0,
        "currentEpoch": 0,
        "totalEpochs": config.get("max_train_epochs", 0),
        "currentStep": 0,
        "totalSteps": config.get("max_train_steps", 0),
        "currentLoss": 0.0,
        "lossHistory": [],
        "learningRate": config.get("learning_rate", 0),
        "batchSize": config.get("train_batch_size", 1),
        "resolution": str(resolution),
        "model": model_name,
        "dataset": dataset_name,
        "outputPath": config.get("output_dir", ""),
        "configPath": str(filepath),
        "tensorboardLogDir": config.get("logging_dir", ""),
        "startTime": "2026-02-25T10:00:00",
        "estimatedTimeRemaining": "calculating...",
        "gpuUtilization": 0,
        "vramUsed": 0,
        "dataSource": "config-file",
    }


def main():
    print("\nTOML Training Config Parser Tests")
    print(f"Sample configs: {SAMPLE_DIR}\n")

    if not SAMPLE_DIR.exists():
        print(f"ERROR: Sample config directory not found: {SAMPLE_DIR}")
        sys.exit(1)

    toml_files = sorted(SAMPLE_DIR.glob("*.toml"))
    if not toml_files:
        print(f"ERROR: No .toml files found in {SAMPLE_DIR}")
        sys.exit(1)

    total = 0
    passed = 0
    failed = 0

    for filepath in toml_files:
        total += 1
        print("-" * 55)
        print(f"FILE: {filepath.name}")

        ok, messages = validate_toml_file(filepath)
        if ok:
            passed += 1
            print("OK: All required fields valid for this config type")
        else:
            failed += 1
            print("FAIL: Validation failed")

        for msg in messages:
            print(f"  - {msg}")

        try:
            job = simulate_job_build(filepath)
            print("  Simulated TrainingJob:")
            print(f"    name={job['name']}, model={job['model']}, dataset={job['dataset']}")
            print(f"    resolution={job['resolution']}, batch={job['batchSize']}, lr={job['learningRate']}")
            print(f"    epochs={job['totalEpochs']}, steps={job['totalSteps']}")
            print(f"    output={job['outputPath']}")
            print(f"    logs={job['tensorboardLogDir']}")
        except Exception as e:
            print(f"  FAIL: Job build simulation failed: {e}")
            failed += 1

    print("\n" + "=" * 55)
    print(f"Results: {passed}/{total} configs valid, {failed} issues")
    print()

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
