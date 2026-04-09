@echo off
:: === CRLF + WRAPPER (single line = immune to LF line endings) ===
if not defined RTX5090_RUNNING (set "RTX5090_RUNNING=1" & more < "%~f0" > "%~f0.tmp" & move /y "%~f0.tmp" "%~f0" >nul 2>&1 & cmd /k "%~f0" %* & exit /b)

setlocal enabledelayedexpansion
chcp 437 >nul 2>&1
title RTX 5090 AI Stack - Setup + Update
color 0A

:: --- Progress bar setup ---
set "_BARFULL=####################"
set "_BARNONE=--------------------"

:: ############################################################
:: #                                                          #
:: #   CONFIGURATION BLOCK - CHANGE THESE WHEN NEEDED         #
:: #                                                          #
:: ############################################################

:: --- Python ---
set "PREFERRED_PYTHON=3.12"
set "PREFERRED_MINOR=12"
set "MIN_PYTHON_MINOR=10"
set "MAX_PYTHON_MINOR=12"

:: --- PyTorch CUDA wheel tag ---
set "TORCH_WHEEL_DEFAULT=cu128"

:: --- Minimum NVIDIA driver ---
set "MIN_DRIVER=570"

:: --- .NET SDK major version ---
set "DOTNET_MAJOR=8"

:: --- Base directory (where this bat lives) ---
set "BASE_DIR=%~dp0"
set "BASE_DIR=!BASE_DIR:~0,-1!"

:: --- App directories ---
set "COMFYUI_DIR=!BASE_DIR!\ComfyUI"
set "SWARMUI_DIR=!BASE_DIR!\SwarmUI"
set "KOHYA_DIR=!BASE_DIR!\kohya_ss"
set "MUSUBI_DIR=!BASE_DIR!\musubi-tuner"
set "MODELS_DIR=!BASE_DIR!\models"

:: --- VS Code extensions ---
set "VSCODE_EXT_1=ms-python.python"
set "VSCODE_EXT_2=ms-python.vscode-pylance"
set "VSCODE_EXT_3=ms-toolsai.jupyter"
set "VSCODE_EXT_4=GitHub.copilot"
set "VSCODE_EXT_5=ms-vscode.cpptools"
set "VSCODE_EXT_COUNT=5"

:: ############################################################
:: #   END CONFIGURATION                                      #
:: ############################################################

:: --- Log ---
set "LOG=!BASE_DIR!\RTX5090_SETUP_LOG.txt"
echo. > "!LOG!"
echo ============================================================ >> "!LOG!"
echo  RTX 5090 Auto-Setup Log - %date% %time% >> "!LOG!"
echo ============================================================ >> "!LOG!"

:: --- Track state ---
set "FORCE_REINSTALL=0"
set "PY_CMD=python"
set "PY_VER=unknown"

:: ============================================================
::  DETECT existing installs (for menu display)
:: ============================================================
call :detect_installs

:: ============================================================
::  MAIN MENU
:: ============================================================
:main_menu
cls
color 0A
echo.
echo  +===========================================================+
echo  :     RTX 5090 AI Stack - Setup + Auto-Update               :
echo  :     System: RTX 5090 + Ryzen 9950X + 96GB RAM             :
echo  +===========================================================+
echo.
echo   Base: !BASE_DIR!
echo.
echo  +-----------------------------------------------------------+
echo  :  [1] FULL SETUP - Everything, fresh or update             :
echo  :      System + ComfyUI + SwarmUI + Kohya + Musubi          :
echo  :                                                           :
call :show_menu_item 2 ComfyUI "!HAS_COMFYUI!"
call :show_menu_item 3 SwarmUI "!HAS_SWARMUI!"
call :show_menu_item 4 "Kohya ss / sd-scripts" "!HAS_KOHYA!"
call :show_menu_item 5 "Musubi Tuner" "!HAS_MUSUBI!"
echo  :                                                           :
echo  :  [6] System Only - drivers, Python, packages              :
echo  :  [7] Custom Nodes + Models - add-ons for ComfyUI          :
echo  :  [8] Update ALL - quick update pass                       :
echo  :  [9] Cleanup - temp files, caches, __pycache__            :
echo  :  [0] Diagnostics - system summary                         :
echo  :                                                           :
echo  :  [C] ComfyUI Reset - clean nodes back to pristine         :
echo  :  [S] Shared Models Audit - verify links + counts          :
echo  :  [R] Full Reset - remove apps for fresh reinstall         :
echo  :  [P] PATH Cleanup - fix stale Python/CUDA paths           :
echo  :  [Q] Quit                                                 :
echo  +-----------------------------------------------------------+
echo.
set /p MENU_CHOICE="  Your choice: "

if /i "!MENU_CHOICE!"=="1" goto :do_full
if /i "!MENU_CHOICE!"=="2" goto :do_comfyui_only
if /i "!MENU_CHOICE!"=="3" goto :do_swarmui_only
if /i "!MENU_CHOICE!"=="4" goto :do_kohya_only
if /i "!MENU_CHOICE!"=="5" goto :do_musubi_only
if /i "!MENU_CHOICE!"=="6" goto :do_system_only
if /i "!MENU_CHOICE!"=="7" goto :do_nodes_models
if /i "!MENU_CHOICE!"=="8" goto :do_update_all
if /i "!MENU_CHOICE!"=="9" goto :do_cleanup_only
if /i "!MENU_CHOICE!"=="0" goto :do_diag_only
if /i "!MENU_CHOICE!"=="C" goto :do_comfy_reset
if /i "!MENU_CHOICE!"=="S" goto :do_model_audit
if /i "!MENU_CHOICE!"=="R" goto :do_full_reset
if /i "!MENU_CHOICE!"=="P" goto :do_path_cleanup
if /i "!MENU_CHOICE!"=="Q" goto :done
echo  Invalid choice.
timeout /t 2 >nul
goto :main_menu

:: ============================================================
::  MENU HELPERS (avoid IF/ELSE blocks with special chars)
:: ============================================================
:detect_installs
set "HAS_COMFYUI=0"
set "HAS_SWARMUI=0"
set "HAS_KOHYA=0"
set "HAS_MUSUBI=0"
if exist "!COMFYUI_DIR!\main.py" set "HAS_COMFYUI=1"
if exist "!SWARMUI_DIR!\launchtools" set "HAS_SWARMUI=1"
if exist "!KOHYA_DIR!\sdxl_train_network.py" set "HAS_KOHYA=1"
if exist "!KOHYA_DIR!\sd-scripts\sdxl_train_network.py" set "HAS_KOHYA=1"
if exist "!MUSUBI_DIR!\train_network.py" set "HAS_MUSUBI=1"
if exist "!MUSUBI_DIR!\.git" set "HAS_MUSUBI=1"
goto :eof

:show_menu_item
set "MI_NUM=%~1"
set "MI_NAME=%~2"
set "MI_HAS=%~3"
if "!MI_HAS!"=="1" goto :smi_installed
echo  :  [!MI_NUM!] !MI_NAME! .................... not installed      :
goto :eof
:smi_installed
echo  :  [!MI_NUM!] !MI_NAME! .................... INSTALLED - update :
goto :eof

:: ============================================================
::  MENU HANDLERS
:: ============================================================
:do_full
call :phase_path_cleanup
call :phase_system
call :phase_comfyui
call :phase_swarmui
call :phase_kohya
call :phase_musubi
call :phase_nodes_models
call :phase_cleanup
call :phase_diagnostics
goto :end_menu

:do_comfyui_only
call :setup_python_cmd
call :phase_comfyui
call :phase_nodes_models
goto :end_menu

:do_swarmui_only
call :setup_python_cmd
call :phase_swarmui
goto :end_menu

:do_kohya_only
call :setup_python_cmd
call :phase_kohya
goto :end_menu

:do_musubi_only
call :setup_python_cmd
call :phase_musubi
goto :end_menu

:do_system_only
call :phase_system
call :phase_diagnostics
goto :end_menu

:do_nodes_models
call :setup_python_cmd
call :phase_nodes_models
goto :end_menu

:do_update_all
call :setup_python_cmd
echo.
echo  =============================================================
echo   QUICK UPDATE ALL
echo  =============================================================
echo.
call :update_comfyui
call :update_swarmui
call :update_kohya
call :update_musubi
call :update_pip_packages
goto :end_menu

:do_cleanup_only
call :phase_cleanup
goto :end_menu

:do_comfy_reset
call :phase_comfy_reset
goto :end_menu

:do_model_audit
call :phase_model_audit
goto :end_menu

:do_full_reset
call :phase_full_reset
call :detect_installs
goto :end_menu

:do_path_cleanup
call :phase_path_cleanup
goto :end_menu

:do_diag_only
call :setup_python_cmd
call :phase_diagnostics
goto :end_menu

:end_menu
echo.
echo  =============================================================
echo   DONE! Log: !LOG!
echo  =============================================================
echo.
set /p BACK="  Press ENTER for menu, or Q to quit: "
if /i "!BACK!"=="Q" goto :done
goto :main_menu

:: ############################################################
:: #                                                          #
:: #   PHASE: SYSTEM SETUP                                    #
:: #                                                          #
:: ############################################################
:phase_system
echo.
echo  =============================================================
echo   SYSTEM SETUP
echo  =============================================================
echo  SYSTEM SETUP >> "!LOG!"
echo.
call :get_ts
set "_sys_start=!_TS!"

:: --- Admin check ---
net session >nul 2>&1
if !errorlevel! neq 0 echo  [WARN] Not running as Administrator.
if !errorlevel! neq 0 echo.

:: --- WINGET ---
set "WINGET_CMD=winget"
where winget >nul 2>&1
if !errorlevel! equ 0 goto :sys_winget_ok
:: Admin sessions often lack WindowsApps in PATH - resolve manually
set "WINGET_FALLBACK=%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe"
if exist "!WINGET_FALLBACK!" (
    set "PATH=%LOCALAPPDATA%\Microsoft\WindowsApps;!PATH!"
    goto :sys_winget_ok
)
:: Try resolving via PowerShell as last resort
for /f "delims=" %%W in ('powershell -NoProfile -Command "(Get-Command winget -EA SilentlyContinue).Source" 2^>nul') do (
    if exist "%%W" (
        for %%D in ("%%~dpW.") do set "PATH=%%~fD;!PATH!"
        goto :sys_winget_ok
    )
)
:: Not found at all
echo  [WARN] winget not found - auto-install unavailable.
echo         Already-installed tools will still be verified.
set "WINGET_CMD="
goto :sys_check_git
:sys_winget_ok
echo  [OK] winget

:: --- GIT ---
:sys_check_git
where git >nul 2>&1
if !errorlevel! equ 0 goto :sys_git_ok
echo  [AUTO-INSTALL] Git...
winget install Git.Git --accept-source-agreements --accept-package-agreements
goto :sys_check_python
:sys_git_ok
echo  [OK] Git

:: --- PYTHON ---
:sys_check_python
call :setup_python

:: --- .NET SDK ---
call :check_dotnet

:: --- VS BUILD TOOLS ---
call :check_vs_buildtools

:: --- VS CODE ---
call :check_vscode

:: --- 7-ZIP ---
call :check_7zip

:: --- FFMPEG ---
call :check_ffmpeg

echo.

:: --- NVIDIA + CUDA ---
call :check_nvidia
call :check_cuda

echo.

:: --- Python packages ---
call :install_pytorch
call :install_ai_packages

echo.

:: --- Environment ---
call :setup_environment

:: --- VS Code extensions ---
call :install_vscode_extensions

echo.
call :get_ts
call :calc_elapsed !_sys_start! !_TS!
echo  +-------------------------------------------------------+
echo  :  System Setup Complete
echo  :  Time: !_ELAPSED!
echo  +-------------------------------------------------------+
echo.
goto :eof

:: --- System setup helpers (avoid IF/ELSE blocks) ---
:check_dotnet
set "DOTNET_OK=0"
dotnet --list-sdks 2>nul | findstr /b "!DOTNET_MAJOR!." >nul
if !errorlevel! equ 0 set "DOTNET_OK=1"
if "!DOTNET_OK!"=="1" goto :dotnet_ok
echo  [AUTO-INSTALL] .NET !DOTNET_MAJOR! SDK...
winget install Microsoft.DotNet.SDK.!DOTNET_MAJOR! --accept-source-agreements --accept-package-agreements
goto :eof
:dotnet_ok
echo  [OK] .NET !DOTNET_MAJOR! SDK
goto :eof

:check_vs_buildtools
set "VS_OK=0"
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" set "VS_OK=1"
if exist "C:\Program Files\Microsoft Visual Studio\2022\Community" set "VS_OK=1"
if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional" set "VS_OK=1"
if "!VS_OK!"=="1" goto :vs_ok
echo  [AUTO-INSTALL] VS 2022 Build Tools...
winget install Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --accept-package-agreements
echo  [IMPORTANT] Add "Desktop development with C++" workload
goto :eof
:vs_ok
echo  [OK] VS Build Tools C++
goto :eof

:check_vscode
where code >nul 2>&1
if !errorlevel! equ 0 goto :vscode_ok
echo  [AUTO-INSTALL] VS Code...
winget install Microsoft.VisualStudioCode --accept-source-agreements --accept-package-agreements
goto :eof
:vscode_ok
echo  [OK] VS Code
goto :eof

:check_7zip
set "ZIP_OK=0"
where 7z >nul 2>&1 && set "ZIP_OK=1"
if exist "C:\Program Files\7-Zip\7z.exe" set "ZIP_OK=1"
if "!ZIP_OK!"=="1" goto :zip_ok
echo  [AUTO-INSTALL] 7-Zip...
winget install 7zip.7zip --accept-source-agreements --accept-package-agreements
goto :eof
:zip_ok
echo  [OK] 7-Zip
goto :eof

:check_ffmpeg
where ffmpeg >nul 2>&1
if !errorlevel! equ 0 goto :ffmpeg_ok
echo  [AUTO-INSTALL] ffmpeg...
winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
goto :eof
:ffmpeg_ok
echo  [OK] ffmpeg
goto :eof

:: ############################################################
:: #   SHARED MODELS AUDIT                                     #
:: ############################################################
:phase_model_audit
echo.
echo  =============================================================
echo   SHARED MODELS AUDIT
echo  =============================================================
echo.

:: --- Check shared models root ---
set "_ma_ok=0"
set "_ma_warn=0"

if not exist "!MODELS_DIR!" goto :ma_no_root
echo  [OK] Shared models root: !MODELS_DIR!
set /a _ma_ok+=1
goto :ma_check_subdirs

:ma_no_root
echo  [MISSING] Shared models root: !MODELS_DIR!
echo           Run Full Setup or ComfyUI install to create it.
set /a _ma_warn+=1
goto :ma_comfy_yaml

:: --- Check subdirectories ---
:ma_check_subdirs
echo.
echo  Model subdirectories:
call :ma_check_subdir checkpoints
call :ma_check_subdir vae
call :ma_check_subdir loras
call :ma_check_subdir controlnet
call :ma_check_subdir clip
call :ma_check_subdir clip_vision
call :ma_check_subdir upscale_models
call :ma_check_subdir embeddings
call :ma_check_subdir ipadapter
call :ma_check_subdir unet
call :ma_check_subdir diffusion_models

:: --- Count total models ---
echo.
set "_ma_total_models=0"
for /r "!MODELS_DIR!" %%f in (*.safetensors *.ckpt *.pt *.bin *.gguf *.pth) do set /a _ma_total_models+=1
echo  Total model files: !_ma_total_models!

:: --- Check ComfyUI yaml ---
:ma_comfy_yaml
echo.
echo  Configuration files:
set "COMFY_YAML=!COMFYUI_DIR!\extra_model_paths.yaml"
if not exist "!COMFY_YAML!" goto :ma_comfy_yaml_missing
echo  [OK] ComfyUI extra_model_paths.yaml
set /a _ma_ok+=1
goto :ma_swarm_yaml
:ma_comfy_yaml_missing
if not exist "!COMFYUI_DIR!\main.py" goto :ma_comfy_not_installed
echo  [MISSING] ComfyUI extra_model_paths.yaml
echo           ComfyUI won't see shared models!
echo           Fix: Run ComfyUI install/update from menu [2]
set /a _ma_warn+=1
goto :ma_swarm_yaml
:ma_comfy_not_installed
echo  [SKIP] ComfyUI not installed
goto :ma_swarm_yaml

:: --- Check SwarmUI yaml ---
:ma_swarm_yaml
set "SWARM_COMFY_YAML=!SWARMUI_DIR!\dlbackend\comfyui\ComfyUI\extra_model_paths.yaml"
set "SWARM_SETTINGS=!SWARMUI_DIR!\Data\Settings\Model-Paths.fds"

if not exist "!SWARMUI_DIR!\launchtools" goto :ma_swarm_not_installed

:: Check SwarmUI's own settings
if not exist "!SWARM_SETTINGS!" goto :ma_swarm_settings_missing
echo  [OK] SwarmUI Model-Paths.fds
set /a _ma_ok+=1
goto :ma_swarm_backend
:ma_swarm_settings_missing
echo  [MISSING] SwarmUI Model-Paths.fds
echo           Fix: Run SwarmUI install/update from menu [3]
set /a _ma_warn+=1

:ma_swarm_backend
:: Check SwarmUI's ComfyUI backend yaml (only exists after first launch)
if not exist "!SWARMUI_DIR!\dlbackend\comfyui\ComfyUI" goto :ma_swarm_backend_not_yet
if not exist "!SWARM_COMFY_YAML!" goto :ma_swarm_backend_missing
echo  [OK] SwarmUI ComfyUI backend extra_model_paths.yaml
set /a _ma_ok+=1
goto :ma_summary
:ma_swarm_backend_missing
echo  [MISSING] SwarmUI ComfyUI backend extra_model_paths.yaml
echo           Fix: Run SwarmUI install/update from menu [3]
set /a _ma_warn+=1
goto :ma_summary
:ma_swarm_backend_not_yet
echo  [INFO] SwarmUI ComfyUI backend not created yet (appears after first launch)
goto :ma_summary

:ma_swarm_not_installed
echo  [SKIP] SwarmUI not installed
goto :ma_summary

:: --- Summary ---
:ma_summary
echo.
echo  +-------------------------------------------------------+
echo  :  Shared Models Audit Complete
echo  :  OK: !_ma_ok!   Warnings: !_ma_warn!
if "!_ma_warn!"=="0" echo  :  All model links are properly configured!
if not "!_ma_warn!"=="0" echo  :  Some links need attention - see warnings above
echo  +-------------------------------------------------------+
echo.
goto :eof

:: --- Helper: check one model subdirectory ---
:ma_check_subdir
set "_ma_sub=!MODELS_DIR!\%~1"
if not exist "!_ma_sub!" goto :ma_sub_missing
set "_ma_fcount=0"
for %%f in ("!_ma_sub!\*.safetensors" "!_ma_sub!\*.ckpt" "!_ma_sub!\*.pt" "!_ma_sub!\*.bin" "!_ma_sub!\*.gguf" "!_ma_sub!\*.pth") do set /a _ma_fcount+=1
set "_ma_pad=          %~1"
set "_ma_pad=!_ma_pad:~-20!"
echo    [OK] !_ma_pad! ... !_ma_fcount! files
set /a _ma_ok+=1
goto :eof
:ma_sub_missing
set "_ma_pad=          %~1"
set "_ma_pad=!_ma_pad:~-20!"
echo    [--] !_ma_pad! ... missing (will be created on install)
goto :eof

:: ############################################################
:: #   FULL RESET - REMOVE APPS FOR FRESH REINSTALL            #
:: ############################################################
:phase_full_reset
echo.
echo  =============================================================
echo   FULL RESET
echo  =============================================================
echo.
echo  This removes installed apps so you can test a fresh install.
echo  Choose a reset level:
echo.
echo  +-------------------------------------------------------+
echo  :                                                       :
echo  :  [1] Soft Reset - remove app repos only               :
echo  :      Removes: ComfyUI, SwarmUI, Kohya, Musubi repos   :
echo  :      Keeps:   models/, training_data/, system tools    :
echo  :      Then:    run [1] Full Setup for fresh install     :
echo  :                                                       :
echo  :  [2] Hard Reset - apps + configs + caches             :
echo  :      Removes: app repos, launchers, generated configs  :
echo  :      Removes: __pycache__, .pyc, pip cache             :
echo  :      Keeps:   models/, training_data/                  :
echo  :                                                       :
echo  :  [3] Nuclear - everything except this script           :
echo  :      Removes: ALL folders and files in !BASE_DIR!      :
echo  :      Keeps:   RTX5090_FULL_SETUP.bat + _AUDIT.py only :
echo  :      WARNING: models + training data will be deleted!  :
echo  :                                                       :
echo  :  [4] Cancel                                           :
echo  :                                                       :
echo  +-------------------------------------------------------+
echo.
set /p FR_CHOICE="  Choice: "

if "!FR_CHOICE!"=="1" goto :fr_soft
if "!FR_CHOICE!"=="2" goto :fr_hard
if "!FR_CHOICE!"=="3" goto :fr_nuclear
goto :eof

:: ---- SOFT RESET ----
:fr_soft
echo.
echo  [SOFT RESET] This will remove:
echo    - !COMFYUI_DIR!
echo    - !SWARMUI_DIR!
echo    - !KOHYA_DIR!
echo    - !MUSUBI_DIR!
echo.
echo  Models and training data will NOT be touched.
echo.
set /p FR_CONFIRM="  Type RESET to confirm: "
if /i "!FR_CONFIRM!" neq "RESET" goto :fr_cancelled

echo.
if exist "!COMFYUI_DIR!" echo  [REMOVE] ComfyUI...
if exist "!COMFYUI_DIR!" rd /s /q "!COMFYUI_DIR!" 2>nul
if exist "!SWARMUI_DIR!" echo  [REMOVE] SwarmUI...
if exist "!SWARMUI_DIR!" rd /s /q "!SWARMUI_DIR!" 2>nul
if exist "!KOHYA_DIR!" echo  [REMOVE] Kohya ss...
if exist "!KOHYA_DIR!" rd /s /q "!KOHYA_DIR!" 2>nul
if exist "!MUSUBI_DIR!" echo  [REMOVE] Musubi Tuner...
if exist "!MUSUBI_DIR!" rd /s /q "!MUSUBI_DIR!" 2>nul

echo.
echo  +-------------------------------------------------------+
echo  :  Soft Reset Complete
echo  :  All app repos removed. Models + data preserved.
echo  :  Run [1] Full Setup now for a fresh install test.
echo  +-------------------------------------------------------+
echo.
goto :eof

:: ---- HARD RESET ----
:fr_hard
echo.
echo  [HARD RESET] This will remove:
echo    - All app repos (ComfyUI, SwarmUI, Kohya, Musubi)
echo    - All generated launchers and configs
echo    - All __pycache__, .pyc, pip cache
echo    - Setup log file
echo.
echo  KEPT: models/ and training_data/
echo.
set /p FR_CONFIRM="  Type HARDRESET to confirm: "
if /i "!FR_CONFIRM!" neq "HARDRESET" goto :fr_cancelled

echo.
:: Remove app repos
if exist "!COMFYUI_DIR!" echo  [REMOVE] ComfyUI...
if exist "!COMFYUI_DIR!" rd /s /q "!COMFYUI_DIR!" 2>nul
if exist "!SWARMUI_DIR!" echo  [REMOVE] SwarmUI...
if exist "!SWARMUI_DIR!" rd /s /q "!SWARMUI_DIR!" 2>nul
if exist "!KOHYA_DIR!" echo  [REMOVE] Kohya ss...
if exist "!KOHYA_DIR!" rd /s /q "!KOHYA_DIR!" 2>nul
if exist "!MUSUBI_DIR!" echo  [REMOVE] Musubi Tuner...
if exist "!MUSUBI_DIR!" rd /s /q "!MUSUBI_DIR!" 2>nul

:: Remove caches
echo  [CLEAN] Caches...
call !PY_CMD! -m pip cache purge --quiet >nul 2>&1
set "_fr_pycache=0"
for /f "tokens=*" %%d in ('dir /b /s /ad "!BASE_DIR!\__pycache__" 2^>nul') do rd /s /q "%%d" 2>nul
set "_fr_pyc=0"
for /r "!BASE_DIR!" %%f in (*.pyc) do del "%%f" 2>nul

:: Remove log
if exist "!LOG!" del "!LOG!" 2>nul

:: Remove any stray generated files in base dir
for %%F in ("!BASE_DIR!\LAUNCH_*.bat") do del "%%F" 2>nul

echo.
echo  +-------------------------------------------------------+
echo  :  Hard Reset Complete
echo  :  Apps, configs, caches removed.
echo  :  models/ and training_data/ preserved.
echo  :  Run [1] Full Setup now for a fresh install test.
echo  +-------------------------------------------------------+
echo.
goto :eof

:: ---- NUCLEAR RESET ----
:fr_nuclear
echo.
echo  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo  !!  NUCLEAR RESET - THIS DELETES EVERYTHING            !!
echo  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo.
echo  This will permanently delete:
echo    - ALL apps (ComfyUI, SwarmUI, Kohya, Musubi)
echo    - ALL models (checkpoints, LoRAs, VAEs, etc.)
echo    - ALL training data
echo    - ALL configs, launchers, caches, logs
echo.
echo  ONLY these files will survive:
echo    - !BASE_DIR!\RTX5090_FULL_SETUP.bat
echo    - !BASE_DIR!\RTX5090_PATH_AUDIT.py
echo.

:: Show disk usage estimate
set "_fr_size=unknown"
for /f "tokens=3" %%S in ('dir "!BASE_DIR!" /s 2^>nul ^| findstr "File(s)"') do set "_fr_size=%%S"
echo  Total size to delete: approximately !_fr_size! bytes
echo.

set /p FR_CONFIRM="  Type NUCLEAR to confirm: "
if /i "!FR_CONFIRM!" neq "NUCLEAR" goto :fr_cancelled

echo.
echo  [NUCLEAR] Removing everything...

:: Remove each known directory
if exist "!COMFYUI_DIR!" echo  [REMOVE] ComfyUI...
if exist "!COMFYUI_DIR!" rd /s /q "!COMFYUI_DIR!" 2>nul
if exist "!SWARMUI_DIR!" echo  [REMOVE] SwarmUI...
if exist "!SWARMUI_DIR!" rd /s /q "!SWARMUI_DIR!" 2>nul
if exist "!KOHYA_DIR!" echo  [REMOVE] Kohya ss...
if exist "!KOHYA_DIR!" rd /s /q "!KOHYA_DIR!" 2>nul
if exist "!MUSUBI_DIR!" echo  [REMOVE] Musubi Tuner...
if exist "!MUSUBI_DIR!" rd /s /q "!MUSUBI_DIR!" 2>nul
if exist "!MODELS_DIR!" echo  [REMOVE] Models...
if exist "!MODELS_DIR!" rd /s /q "!MODELS_DIR!" 2>nul
if exist "!BASE_DIR!\training_data" echo  [REMOVE] Training data...
if exist "!BASE_DIR!\training_data" rd /s /q "!BASE_DIR!\training_data" 2>nul

:: Remove any other dirs/files except the scripts themselves
for /d %%D in ("!BASE_DIR!\*") do call :fr_nuke_dir "%%D"
for %%F in ("!BASE_DIR!\*") do call :fr_nuke_file "%%F"

echo.
echo  +-------------------------------------------------------+
echo  :  Nuclear Reset Complete
echo  :  !BASE_DIR! is now empty (scripts only).
echo  :  Run [1] Full Setup for a completely fresh install.
echo  +-------------------------------------------------------+
echo.
goto :eof

:fr_nuke_dir
:: Skip known-removed dirs (already handled above)
rd /s /q "%~1" 2>nul
goto :eof

:fr_nuke_file
:: Protect the setup scripts
set "_fr_fn=%~nx1"
if /i "!_fr_fn!"=="RTX5090_FULL_SETUP.bat" goto :eof
if /i "!_fr_fn!"=="RTX5090_PATH_AUDIT.py" goto :eof
if /i "!_fr_fn!"=="RTX5090_FULL_SETUP.bat.tmp" goto :eof
del "%~1" 2>nul
goto :eof

:fr_cancelled
echo  [CANCELLED] No changes made.
goto :eof

:: ############################################################
:: #   COMFYUI RESET - CLEAN CUSTOM NODES                     #
:: ############################################################
:phase_comfy_reset
echo.
echo  =============================================================
echo   COMFYUI RESET - Clean Custom Nodes
echo  =============================================================
echo.

if not exist "!COMFYUI_DIR!\main.py" goto :cr_no_comfy

set "CR_NODES_DIR=!COMFYUI_DIR!\custom_nodes"
if not exist "!CR_NODES_DIR!" goto :cr_no_nodes

:: Count current nodes
set "_cr_count=0"
for /d %%D in ("!CR_NODES_DIR!\*") do if exist "%%D\.git" set /a _cr_count+=1

echo  Found !_cr_count! custom nodes in:
echo  !CR_NODES_DIR!
echo.
echo  Options:
echo.
echo  [1] Remove ALL custom nodes (clean slate)
echo  [2] Remove specific broken nodes
echo  [3] Reinstall all node requirements (fix broken deps)
echo  [4] Cancel
echo.
set /p CR_CHOICE="  Choice: "

if "!CR_CHOICE!"=="1" goto :cr_remove_all
if "!CR_CHOICE!"=="2" goto :cr_remove_pick
if "!CR_CHOICE!"=="3" goto :cr_fix_deps
goto :eof

:cr_remove_all
echo.
echo  [WARN] This will remove ALL !_cr_count! custom nodes!
echo         ComfyUI itself will NOT be touched.
echo         You can reinstall nodes with menu option [7].
echo.
set /p CR_CONFIRM="  Type YES to confirm: "
if /i "!CR_CONFIRM!" neq "YES" goto :cr_cancelled

echo.
echo  [CLEAN] Removing all custom nodes...
set "_cr_removed=0"
for /d %%D in ("!CR_NODES_DIR!\*") do call :cr_remove_one "%%D"
echo.
echo  [OK] Removed !_cr_removed! custom nodes.
echo  [INFO] ComfyUI is now in pristine state.
echo  [INFO] Use menu [7] to reinstall nodes when ready.
echo.
goto :eof

:cr_remove_one
if not exist "%~1\.git" goto :eof
echo   Removing: %~nx1
rd /s /q "%~1" 2>nul
set /a _cr_removed+=1
goto :eof

:cr_remove_pick
echo.
echo  --- Select nodes to remove (Y to remove, N to keep) ---
echo.
for /d %%D in ("!CR_NODES_DIR!\*") do call :cr_ask_remove "%%D"
echo.
echo  [OK] Selected nodes removed.
goto :eof

:cr_ask_remove
if not exist "%~1\.git" goto :eof
set /p CR_YN="  Remove %~nx1? (Y/N): "
if /i "!CR_YN!" neq "Y" goto :eof
echo   [REMOVE] %~nx1
rd /s /q "%~1" 2>nul
goto :eof

:cr_fix_deps
echo.
echo  [FIX] Reinstalling requirements for all custom nodes...
set "_cr_fixed=0"
for /d %%D in ("!CR_NODES_DIR!\*") do call :cr_fix_one "%%D"
echo.
echo  [OK] Reinstalled requirements for !_cr_fixed! nodes.
goto :eof

:cr_fix_one
if not exist "%~1\.git" goto :eof
if not exist "%~1\requirements.txt" goto :eof
set /a _cr_fixed+=1
echo   [FIX] %~nx1
pushd "%~1"
call !PY_CMD! -m pip install -r requirements.txt --quiet >nul 2>&1
popd
goto :eof

:cr_cancelled
echo  [CANCELLED] No changes made.
goto :eof

:cr_no_comfy
echo  [SKIP] ComfyUI not installed.
goto :eof

:cr_no_nodes
echo  [OK] No custom nodes found - already clean!
goto :eof

:: ############################################################
:: #   PATH CLEANUP + ENVIRONMENT FIX                         #
:: ############################################################
:phase_path_cleanup
echo.
echo  =============================================================
echo   PATH AUDIT + CLEANUP
echo  =============================================================
echo  PATH CLEANUP >> "!LOG!"
echo.

:: Admin check
net session >nul 2>&1
if !errorlevel! equ 0 goto :pathclean_admin_ok

echo  [WARN] PATH cleanup requires Administrator privileges.
echo         Right-click this .bat, "Run as administrator"
echo.
set /p CONT_NA="  Continue anyway for audit-only? (Y/N): "
if /i "!CONT_NA!" neq "Y" goto :eof

:pathclean_admin_ok
:: Check Python is available
call !PY_CMD! -c "print('ok')" >nul 2>&1
if !errorlevel! neq 0 goto :pathclean_no_python

:: Run the companion Python script
set "PYAUDIT_SCRIPT=!BASE_DIR!\RTX5090_PATH_AUDIT.py"
if not exist "!PYAUDIT_SCRIPT!" goto :pathclean_no_script

echo  [RUN] PATH audit + cleanup...
echo.
call !PY_CMD! "!PYAUDIT_SCRIPT!" "!PREFERRED_PYTHON!"

echo.
echo  PATH cleanup complete.
echo  PATH cleanup >> "!LOG!"
echo.
goto :eof

:pathclean_no_python
echo  [ERROR] Python not available. Run System Setup first.
goto :eof

:pathclean_no_script
echo  [ERROR] RTX5090_PATH_AUDIT.py not found next to this .bat file.
echo         Expected: !PYAUDIT_SCRIPT!
goto :eof

:: ############################################################
:: #   PYTHON SETUP                                           #
:: ############################################################
:setup_python
set "PY_OLD_MINOR=0"

where py >nul 2>&1
if !errorlevel! neq 0 goto :spy_no_launcher

py -!PREFERRED_PYTHON! --version >nul 2>&1
if !errorlevel! equ 0 goto :spy_preferred_found

echo  [INFO] Python !PREFERRED_PYTHON! not found. Installing...
goto :spy_install

:spy_preferred_found
for /f "tokens=2" %%v in ('py -!PREFERRED_PYTHON! --version 2^>^&1') do set "PY_VER=%%v"
for /f "tokens=2 delims=." %%b in ("!PY_VER!") do set "PY_MINOR=%%b"
set "PY_CMD=py -!PREFERRED_PYTHON!"
echo  [OK] Python !PY_VER! via !PY_CMD!
goto :eof

:spy_no_launcher
where python >nul 2>&1
if !errorlevel! neq 0 goto :spy_install
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
for /f "tokens=2 delims=." %%b in ("!PY_VER!") do set "PY_MINOR=%%b"
if !PY_MINOR! equ !PREFERRED_MINOR! goto :spy_no_launcher_ok
echo  [INFO] Python !PY_VER! found, but !PREFERRED_PYTHON! preferred.
goto :spy_install

:spy_no_launcher_ok
set "PY_CMD=python"
echo  [OK] Python !PY_VER!
goto :eof

:spy_install
echo  [AUTO-INSTALL] Python !PREFERRED_PYTHON!...
winget install Python.Python.!PREFERRED_PYTHON! --accept-source-agreements --accept-package-agreements
echo.
:: Recheck
where py >nul 2>&1
if !errorlevel! neq 0 goto :spy_fallback
py -!PREFERRED_PYTHON! --version >nul 2>&1
if !errorlevel! neq 0 goto :spy_fallback
for /f "tokens=2" %%v in ('py -!PREFERRED_PYTHON! --version 2^>^&1') do set "PY_VER=%%v"
set "PY_CMD=py -!PREFERRED_PYTHON!"
set "FORCE_REINSTALL=1"
echo  [OK] Python !PY_VER! installed via !PY_CMD!
goto :eof

:spy_fallback
where python >nul 2>&1
if !errorlevel! neq 0 goto :spy_fail
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
set "PY_CMD=python"
echo  [OK] Using PATH python: !PY_VER!
goto :eof

:spy_fail
echo  [ERROR] No Python found. Install manually.
goto :eof

:: Quick version - just set PY_CMD without installing
:setup_python_cmd
where py >nul 2>&1
if !errorlevel! neq 0 goto :spc_fallback
py -!PREFERRED_PYTHON! --version >nul 2>&1
if !errorlevel! neq 0 goto :spc_fallback
for /f "tokens=2" %%v in ('py -!PREFERRED_PYTHON! --version 2^>^&1') do set "PY_VER=%%v"
set "PY_CMD=py -!PREFERRED_PYTHON!"
goto :eof

:spc_fallback
where python >nul 2>&1
if !errorlevel! neq 0 goto :spc_fail
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
set "PY_CMD=python"
goto :eof

:spc_fail
echo  [ERROR] Python not found. Run System Setup first.
goto :eof

:: ############################################################
:: #   NVIDIA + CUDA                                          #
:: ############################################################
:check_nvidia
nvidia-smi >nul 2>&1
if !errorlevel! neq 0 goto :nvidia_fail
echo  [OK] NVIDIA driver
for /f "tokens=*" %%i in ('nvidia-smi -L 2^>nul') do echo       %%i

call !PY_CMD! -c "import subprocess,re; o=subprocess.check_output('nvidia-smi',text=True); m=re.search(r'Driver Version:\s+([\d.]+)',o); print(m.group(1) if m else 'unknown')" >"%TEMP%\drvver.txt" 2>nul
set /p DRIVER_VER=<"%TEMP%\drvver.txt"
del "%TEMP%\drvver.txt" >nul 2>&1
echo       Driver: !DRIVER_VER!

for /f "tokens=*" %%M in ('nvidia-smi 2^>nul ^| findstr /i "MiB"') do echo       %%M

:: Auto-detect VRAM + RAM and store for the session
set "DETECTED_VRAM_MB=0"
for /f "tokens=*" %%V in ('nvidia-smi --query-gpu^=memory.total --format^=csv^,noheader^,nounits 2^>nul') do set "DETECTED_VRAM_MB=%%V"
set "DETECTED_VRAM_MB=!DETECTED_VRAM_MB: =!"
if "!DETECTED_VRAM_MB!"=="0" set "DETECTED_VRAM_MB=32768"
set "DETECTED_RAM_GB=0"
for /f "skip=1 tokens=*" %%R in ('wmic computersystem get totalphysicalmemory 2^>nul') do if "!DETECTED_RAM_GB!"=="0" set /a "DETECTED_RAM_GB=%%R / 1073741824"
if "!DETECTED_RAM_GB!"=="0" set "DETECTED_RAM_GB=96"

:: Determine VRAM profile for the session
set "VRAM_PROFILE=Low"
if !DETECTED_VRAM_MB! geq 8000 set "VRAM_PROFILE=Medium"
if !DETECTED_VRAM_MB! geq 16000 set "VRAM_PROFILE=High"
if !DETECTED_VRAM_MB! geq 30000 set "VRAM_PROFILE=Ultra"

echo       VRAM: !DETECTED_VRAM_MB! MB  RAM: !DETECTED_RAM_GB! GB
echo       Performance Profile: !VRAM_PROFILE!
echo       VRAM=!DETECTED_VRAM_MB!MB RAM=!DETECTED_RAM_GB!GB Profile=!VRAM_PROFILE! >> "!LOG!"
goto :eof

:nvidia_fail
echo  [ERROR] NVIDIA driver not detected!
echo          RTX 5090 needs Driver !MIN_DRIVER!+
goto :eof

:check_cuda
set "CUDA_FOUND_PATH="
set "CUDA_FOUND_VER="
call :find_cuda_ver 13.0
call :find_cuda_ver 12.9
call :find_cuda_ver 12.8
call :find_cuda_ver 12.6
call :find_cuda_ver 12.5
call :find_cuda_ver 12.4

:: Map CUDA -> wheel
set "TORCH_CUDA_TAG=!TORCH_WHEEL_DEFAULT!"
if not defined CUDA_FOUND_VER goto :cuda_set_index
echo !CUDA_FOUND_VER! | findstr "12.6 12.5 12.4" >nul
if !errorlevel! equ 0 set "TORCH_CUDA_TAG=cu126"

:cuda_set_index
set "TORCH_INDEX=https://download.pytorch.org/whl/!TORCH_CUDA_TAG!"

if defined CUDA_FOUND_VER goto :cuda_found
echo  [MISSING] CUDA Toolkit
echo           https://developer.nvidia.com/cuda-downloads
goto :cuda_check_cudnn

:cuda_found
echo  [OK] CUDA Toolkit !CUDA_FOUND_VER!

:cuda_check_cudnn
:: cuDNN
set "CUDNN_OK=0"
if not defined CUDA_FOUND_PATH goto :cudnn_try_torch
dir /b "!CUDA_FOUND_PATH!\bin\cudnn*.dll" >nul 2>&1
if !errorlevel! equ 0 set "CUDNN_OK=1"

:cudnn_try_torch
call !PY_CMD! -c "import torch; v=torch.backends.cudnn.version(); exit(0 if v and v>0 else 1)" >nul 2>&1
if !errorlevel! equ 0 set "CUDNN_OK=1"

if "!CUDNN_OK!"=="1" goto :cudnn_ok
echo  [MISSING] cuDNN 9.x
goto :eof
:cudnn_ok
echo  [OK] cuDNN
goto :eof

:find_cuda_ver
if defined CUDA_FOUND_PATH goto :eof
if exist "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v%~1\bin\nvcc.exe" goto :fcv_found
goto :eof
:fcv_found
set "CUDA_FOUND_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v%~1"
set "CUDA_FOUND_VER=%~1"
goto :eof

:: ############################################################
:: #   PYTORCH + PACKAGES                                     #
:: ############################################################
:install_pytorch
echo.
echo  --- PyTorch ---
echo  Python: !PY_VER! via !PY_CMD! / Wheels: !TORCH_CUDA_TAG!
echo.

call !PY_CMD! -m pip install --upgrade pip --quiet 2>nul

call !PY_CMD! -c "import torch" >nul 2>&1
if !errorlevel! neq 0 goto :ipt_install
if "!FORCE_REINSTALL!"=="1" goto :ipt_reinstall
call !PY_CMD! -c "import torch; exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
if !errorlevel! neq 0 goto :ipt_fix

echo  [OK] PyTorch + CUDA
echo  [UPGRADE] Checking updates...
call !PY_CMD! -m pip install --upgrade torch torchvision torchaudio --index-url !TORCH_INDEX! --quiet 2>nul
goto :ipt_verify

:ipt_install
echo  [INSTALL] PyTorch !TORCH_CUDA_TAG!...
call !PY_CMD! -m pip install torch torchvision torchaudio --index-url !TORCH_INDEX!
goto :ipt_verify

:ipt_reinstall
echo  [REINSTALL] PyTorch - version changed
call !PY_CMD! -m pip uninstall torch torchvision torchaudio -y --quiet 2>nul
call !PY_CMD! -m pip install torch torchvision torchaudio --index-url !TORCH_INDEX!
goto :ipt_verify

:ipt_fix
echo  [FIX] PyTorch CUDA broken - reinstalling
call !PY_CMD! -m pip uninstall torch torchvision torchaudio -y --quiet 2>nul
call !PY_CMD! -m pip install torch torchvision torchaudio --index-url !TORCH_INDEX!

:ipt_verify
echo.
call !PY_CMD! -c "import torch; print('  CUDA:', torch.cuda.is_available(), '| GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A')" 2>nul
echo.

:: xformers
echo  [UPGRADE] xformers...
call !PY_CMD! -m pip install --upgrade xformers --quiet 2>nul
if !errorlevel! equ 0 goto :xf_ok
echo  [WARN] xformers
goto :xf_done
:xf_ok
echo  [OK] xformers
:xf_done

:: SageAttention
echo  [UPGRADE] SageAttention...
call !PY_CMD! -m pip install --upgrade sageattention --quiet 2>nul
call !PY_CMD! -c "import sageattention" >nul 2>&1
if !errorlevel! equ 0 goto :sa_ok
echo  [SKIP] SageAttention - needs manual CUDA compile
goto :eof
:sa_ok
echo  [OK] SageAttention
goto :eof

:install_ai_packages
echo.
echo  --- AI Packages - auto-upgrade ---
echo.
:: Using CALL :pip_pkg to avoid for-loop parenthesis bugs
set "_pkg_num=0"
set "_pkg_total=46"
set "_pkg_warn=0"
call :get_ts
set "_pkg_start=!_TS!"
call :pip_pkg accelerate
call :pip_pkg scipy
call :pip_pkg opencv-python
call :pip_pkg onnxruntime-gpu
call :pip_pkg insightface
call :pip_pkg ultralytics
call :pip_pkg mediapipe
call :pip_pkg segment-anything
call :pip_pkg timm
call :pip_pkg einops
call :pip_pkg safetensors
call :pip_pkg aiohttp
call :pip_pkg spandrel
call :pip_pkg kornia
call :pip_pkg colour-science
call :pip_pkg numpy
call :pip_pkg pillow
call :pip_pkg requests
call :pip_pkg tqdm
call :pip_pkg pyyaml
call :pip_pkg psutil
call :pip_pkg GitPython
call :pip_pkg filelock
call :pip_pkg huggingface-hub
call :pip_pkg hf_transfer
call :pip_pkg tokenizers
call :pip_pkg transformers
call :pip_pkg diffusers
call :pip_pkg omegaconf
call :pip_pkg peft
call :pip_pkg bitsandbytes
call :pip_pkg prodigyopt
call :pip_pkg lion-pytorch
call :pip_pkg lycoris-lora
call :pip_pkg dadaptation
call :pip_pkg pytorch-lightning
call :pip_pkg tensorboard
call :pip_pkg wandb
call :pip_pkg toml
call :pip_pkg voluptuous
call :pip_pkg altair
call :pip_pkg gradio
call :pip_pkg ftfy
call :pip_pkg albumentations
call :pip_pkg open-clip-torch
call :pip_pkg compel
call :pip_pkg lark
call :get_ts
call :calc_elapsed !_pkg_start! !_TS!
set /a "_pkg_ok=!_pkg_total! - !_pkg_warn!"
call :show_summary "AI Packages" !_pkg_total! !_pkg_ok! !_pkg_warn! "!_ELAPSED!"
goto :eof

:pip_pkg
set /a _pkg_num+=1
call !PY_CMD! -m pip install --upgrade %~1 --quiet >nul 2>&1
if !errorlevel! equ 0 goto :pp_ok
set /a _pkg_warn+=1
call :make_bar !_pkg_num! !_pkg_total!
echo   !_BAR_LINE!  %~1  [WARN]
goto :eof
:pp_ok
call :make_bar !_pkg_num! !_pkg_total!
echo   !_BAR_LINE!  %~1
goto :eof

:update_pip_packages
echo.
echo  [UPDATE] Python packages...
call :install_ai_packages
goto :eof

:: ############################################################
:: #   ENVIRONMENT + VS CODE                                  #
:: ############################################################
:setup_environment
:: Environment variables are now handled by :phase_path_cleanup
:: via Python/winreg. This is a quick fallback check.
set "CUDA_ENV_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8"
if defined CUDA_FOUND_PATH set "CUDA_ENV_PATH=!CUDA_FOUND_PATH!"

if not defined CUDA_HOME goto :env_not_set
if not defined NVIDIA_TF32_OVERRIDE goto :env_not_set
echo  [OK] Environment variables set
goto :eof

:env_not_set
echo  [INFO] Environment variables not fully set.
echo         Use menu option [P] PATH Cleanup for full setup.
echo         Quick-setting essentials now...
setx CUDA_HOME "!CUDA_ENV_PATH!" /M 2>nul
setx CUDA_PATH "!CUDA_ENV_PATH!" /M 2>nul
setx NVIDIA_TF32_OVERRIDE "1" /M 2>nul
setx PYTORCH_CUDA_ALLOC_CONF "expandable_segments:True,garbage_collection_threshold:0.8" /M 2>nul
echo  [OK] Essentials set. Use [P] for full cleanup.
goto :eof

:install_vscode_extensions
:: Find real VS Code (not Cursor) - check standard install paths first
set "_VSCODE_CMD="
if exist "%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd" set "_VSCODE_CMD=%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd"
if exist "%ProgramFiles%\Microsoft VS Code\bin\code.cmd" set "_VSCODE_CMD=%ProgramFiles%\Microsoft VS Code\bin\code.cmd"
if not defined _VSCODE_CMD goto :vsc_try_where
goto :vsc_found

:vsc_try_where
:: Fallback: find code.cmd that is NOT Cursor
for /f "delims=" %%C in ('where code.cmd 2^>nul') do (
    echo %%C | findstr /i "cursor" >nul
    if !errorlevel! neq 0 set "_VSCODE_CMD=%%C"
)
if not defined _VSCODE_CMD echo  [SKIP] VS Code not found (Cursor detected but skipping)
if not defined _VSCODE_CMD goto :eof

:vsc_found
echo  [CHECK] VS Code extensions...
echo         Using: !_VSCODE_CMD!
set "_ext_num=0"
set "_ext_total=5"
set "_ext_warn=0"
call :get_ts
set "_ext_start=!_TS!"
call :install_one_ext "ms-python.python"
call :install_one_ext "ms-python.vscode-pylance"
call :install_one_ext "ms-toolsai.jupyter"
call :install_one_ext "GitHub.copilot"
call :install_one_ext "ms-vscode.cpptools"
call :get_ts
call :calc_elapsed !_ext_start! !_TS!
set /a "_ext_ok=!_ext_total! - !_ext_warn!"
call :show_summary "VS Code Extensions" !_ext_total! !_ext_ok! !_ext_warn! "!_ELAPSED!"
goto :eof

:install_one_ext
set /a _ext_num+=1
call "!_VSCODE_CMD!" --list-extensions 2>nul | findstr /i "%~1" >nul
if !errorlevel! equ 0 goto :ioe_ok
call "!_VSCODE_CMD!" --install-extension %~1 --force >nul 2>&1
if !errorlevel! neq 0 goto :ioe_warn
call :make_bar !_ext_num! !_ext_total!
echo   !_BAR_LINE!  %~1 .. installed
goto :eof
:ioe_warn
set /a _ext_warn+=1
call :make_bar !_ext_num! !_ext_total!
echo   !_BAR_LINE!  %~1 .. WARN
goto :eof
:ioe_ok
call :make_bar !_ext_num! !_ext_total!
echo   !_BAR_LINE!  %~1 .. already installed
goto :eof

:: ############################################################
:: #                                                          #
:: #   COMFYUI                                                #
:: #                                                          #
:: ############################################################
:phase_comfyui
echo.
echo  =============================================================
echo   COMFYUI
echo  =============================================================
echo  COMFYUI >> "!LOG!"
echo.

if exist "!COMFYUI_DIR!\main.py" goto :comfy_update

:: --- FRESH INSTALL ---
echo  [INSTALL] ComfyUI - fresh install...
echo.
if exist "!COMFYUI_DIR!\*" rmdir /s /q "!COMFYUI_DIR!" 2>nul
call git clone https://github.com/comfyanonymous/ComfyUI.git "!COMFYUI_DIR!" --depth 1
if !errorlevel! neq 0 goto :comfy_clone_fail
echo  [OK] ComfyUI cloned

:: Install requirements
echo  [INSTALL] ComfyUI requirements...
pushd "!COMFYUI_DIR!"
call !PY_CMD! -m pip install -r requirements.txt --quiet 2>nul
popd
echo  [OK] Requirements installed

:: Create shared models symlinks/junctions
call :setup_shared_models

:: Create launcher
call :create_comfyui_launcher

echo  [OK] ComfyUI installed!
set "HAS_COMFYUI=1"
goto :eof

:comfy_clone_fail
echo  [ERROR] Git clone failed!
goto :eof

:comfy_update
echo  [UPDATE] ComfyUI...
pushd "!COMFYUI_DIR!"
call :smart_pull
if "!_PULL_CHANGED!"=="1" call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet 2>nul
if "!_PULL_CHANGED!"=="0" echo  [SKIP] Already up to date - pip install skipped
popd
echo  [OK] ComfyUI updated
call :create_comfyui_launcher
goto :eof

:update_comfyui
if "!HAS_COMFYUI!"=="0" goto :eof
echo  [UPDATE] ComfyUI...
pushd "!COMFYUI_DIR!"
call :smart_pull_quiet
if "!_PULL_CHANGED!"=="1" call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet 2>nul
popd
if "!_PULL_CHANGED!"=="0" echo  [OK] ComfyUI (no changes)
if "!_PULL_CHANGED!"=="1" echo  [OK] ComfyUI (updated)
goto :eof

:create_comfyui_launcher
echo  [CREATE] LAUNCH_ComfyUI.bat

:: Fallback defaults if :check_nvidia didn't run or failed
if "!DETECTED_VRAM_MB!"=="" set "DETECTED_VRAM_MB=32768"
if "!DETECTED_RAM_GB!"=="" set "DETECTED_RAM_GB=96"
if "!VRAM_PROFILE!"=="" set "VRAM_PROFILE=Ultra"

:: Select performance args based on VRAM profile (detected in :check_nvidia)
set "_COMFY_PERF=--preview-method auto --auto-launch"
if "!VRAM_PROFILE!"=="Medium" set "_COMFY_PERF=--normalvram --cuda-malloc --fp8_e4m3fn-unet --preview-method auto --auto-launch"
if "!VRAM_PROFILE!"=="High" set "_COMFY_PERF=--highvram --cuda-malloc --fast --preview-method auto --auto-launch"
if "!VRAM_PROFILE!"=="Ultra" set "_COMFY_PERF=--gpu-only --cuda-malloc --fast --reserve-vram 0.5 --preview-method auto --auto-launch"

set "_CL=!COMFYUI_DIR!\LAUNCH_ComfyUI.bat"
> "!_CL!" echo @echo off
>> "!_CL!" echo title ComfyUI - RTX 5090
>> "!_CL!" echo color 0A
>> "!_CL!" echo :: --- Performance environment variables ---
>> "!_CL!" echo set "PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True"
>> "!_CL!" echo set "CUDA_MODULE_LOADING=LAZY"
>> "!_CL!" echo set "HF_HUB_ENABLE_HF_TRANSFER=1"
>> "!_CL!" echo set "TORCH_CUDNN_V8_API_ENABLED=1"
>> "!_CL!" echo echo.
>> "!_CL!" echo echo  ========================================
>> "!_CL!" echo echo   ComfyUI - RTX 5090 Optimized
>> "!_CL!" echo echo  ========================================
>> "!_CL!" echo echo   VRAM: !DETECTED_VRAM_MB! MB  Profile: !VRAM_PROFILE!
>> "!_CL!" echo echo   Args: !_COMFY_PERF!
>> "!_CL!" echo echo  ========================================
>> "!_CL!" echo echo.
>> "!_CL!" echo echo  [1] Launch ComfyUI
>> "!_CL!" echo echo  [2] Update + Launch
>> "!_CL!" echo echo  [3] Update only
>> "!_CL!" echo echo.
>> "!_CL!" echo set /p C="  Choice: "
>> "!_CL!" echo if "%%C%%"=="2" goto :update_launch
>> "!_CL!" echo if "%%C%%"=="3" goto :update_only
>> "!_CL!" echo goto :launch
>> "!_CL!" echo :update_launch
>> "!_CL!" echo echo  [UPDATE] Pulling latest...
>> "!_CL!" echo cd /d "!COMFYUI_DIR!"
>> "!_CL!" echo call git pull
>> "!_CL!" echo echo  [UPDATE] Installing requirements...
>> "!_CL!" echo call !PY_CMD! -m pip install -r requirements.txt --upgrade
>> "!_CL!" echo echo  [OK] Updated - launching...
>> "!_CL!" echo goto :launch
>> "!_CL!" echo :launch
>> "!_CL!" echo cd /d "!COMFYUI_DIR!"
>> "!_CL!" echo echo.
>> "!_CL!" echo echo  Starting ComfyUI...
>> "!_CL!" echo echo  http://127.0.0.1:8188
>> "!_CL!" echo echo.
>> "!_CL!" echo call !PY_CMD! main.py !_COMFY_PERF!
>> "!_CL!" echo if errorlevel 1 echo  [ERROR] ComfyUI exited with an error.
>> "!_CL!" echo pause
>> "!_CL!" echo goto :eof
>> "!_CL!" echo :update_only
>> "!_CL!" echo cd /d "!COMFYUI_DIR!"
>> "!_CL!" echo call git pull
>> "!_CL!" echo call !PY_CMD! -m pip install -r requirements.txt --upgrade
>> "!_CL!" echo echo  [OK] Updated. Press any key to close.
>> "!_CL!" echo pause

echo  [OK] Launcher created
goto :eof

:: ############################################################
:: #   SHARED MODELS FOLDER                                   #
:: ############################################################
:setup_shared_models
echo  [SETUP] Shared models folder...

:: Create shared model directories
if not exist "!MODELS_DIR!" mkdir "!MODELS_DIR!"
call :ensure_dir "!MODELS_DIR!\checkpoints"
call :ensure_dir "!MODELS_DIR!\vae"
call :ensure_dir "!MODELS_DIR!\loras"
call :ensure_dir "!MODELS_DIR!\controlnet"
call :ensure_dir "!MODELS_DIR!\clip"
call :ensure_dir "!MODELS_DIR!\clip_vision"
call :ensure_dir "!MODELS_DIR!\upscale_models"
call :ensure_dir "!MODELS_DIR!\embeddings"
call :ensure_dir "!MODELS_DIR!\ipadapter"
call :ensure_dir "!MODELS_DIR!\unet"
call :ensure_dir "!MODELS_DIR!\diffusion_models"

:: Create training data skeleton
call :setup_training_data

:: Create extra_model_paths.yaml for ComfyUI to use shared folder
echo  [CREATE] extra_model_paths.yaml

> "!COMFYUI_DIR!\extra_model_paths.yaml" echo # Auto-generated by RTX5090_FULL_SETUP.bat
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo # Shared models folder so all apps use the same models
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo shared:
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     base_path: !MODELS_DIR!
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     checkpoints: checkpoints
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     vae: vae
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     loras: loras
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     controlnet: controlnet
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     clip: clip
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     clip_vision: clip_vision
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     upscale_models: upscale_models
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     embeddings: embeddings
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     ipadapter: ipadapter
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     unet: unet
>> "!COMFYUI_DIR!\extra_model_paths.yaml" echo     diffusion_models: diffusion_models

echo  [OK] Shared models at !MODELS_DIR!

:: Generate performance guide
call :create_performance_guide
goto :eof

:ensure_dir
if not exist "%~1" mkdir "%~1"
goto :eof

:: --- Training data skeleton ---
:setup_training_data
set "TRAIN_DIR=!BASE_DIR!\training_data"
if exist "!TRAIN_DIR!\README.txt" goto :std_already

echo  [SETUP] Training data skeleton...
call :ensure_dir "!TRAIN_DIR!"
call :ensure_dir "!TRAIN_DIR!\sdxl_example"
call :ensure_dir "!TRAIN_DIR!\flux_example"
call :ensure_dir "!TRAIN_DIR!\video_example"

> "!TRAIN_DIR!\README.txt" echo ============================================================
>> "!TRAIN_DIR!\README.txt" echo  TRAINING DATA - RTX 5090 AI Stack
>> "!TRAIN_DIR!\README.txt" echo ============================================================
>> "!TRAIN_DIR!\README.txt" echo.
>> "!TRAIN_DIR!\README.txt" echo  This folder holds your training datasets. Each subfolder
>> "!TRAIN_DIR!\README.txt" echo  is one concept/subject. The sample configs in kohya_ss
>> "!TRAIN_DIR!\README.txt" echo  and musubi-tuner point here by default.
>> "!TRAIN_DIR!\README.txt" echo.
>> "!TRAIN_DIR!\README.txt" echo  FOLDER STRUCTURE:
>> "!TRAIN_DIR!\README.txt" echo.
>> "!TRAIN_DIR!\README.txt" echo    sdxl_example\
>> "!TRAIN_DIR!\README.txt" echo      image1.png        (512-2048px, any aspect ratio)
>> "!TRAIN_DIR!\README.txt" echo      image1.txt        (caption: "a photo of sks person")
>> "!TRAIN_DIR!\README.txt" echo      image2.jpg
>> "!TRAIN_DIR!\README.txt" echo      image2.txt
>> "!TRAIN_DIR!\README.txt" echo      ...
>> "!TRAIN_DIR!\README.txt" echo.
>> "!TRAIN_DIR!\README.txt" echo    flux_example\
>> "!TRAIN_DIR!\README.txt" echo      (same as SDXL - images + .txt captions)
>> "!TRAIN_DIR!\README.txt" echo.
>> "!TRAIN_DIR!\README.txt" echo    video_example\
>> "!TRAIN_DIR!\README.txt" echo      clip1.mp4         (short clips, 2-10 seconds)
>> "!TRAIN_DIR!\README.txt" echo      clip1.txt         (caption: "a person walking")
>> "!TRAIN_DIR!\README.txt" echo      clip2.mp4
>> "!TRAIN_DIR!\README.txt" echo      clip2.txt
>> "!TRAIN_DIR!\README.txt" echo      ...
>> "!TRAIN_DIR!\README.txt" echo.
>> "!TRAIN_DIR!\README.txt" echo  TIPS:
>> "!TRAIN_DIR!\README.txt" echo    - Rename these example folders to match your concept
>> "!TRAIN_DIR!\README.txt" echo    - 15-50 images is a good starting point for LoRA
>> "!TRAIN_DIR!\README.txt" echo    - Every image/video needs a matching .txt caption
>> "!TRAIN_DIR!\README.txt" echo    - Use a consistent trigger word (e.g. "sks person")
>> "!TRAIN_DIR!\README.txt" echo    - Crop/resize is handled by bucketing (see config)
>> "!TRAIN_DIR!\README.txt" echo    - Update the image_dir/video_dir path in your .toml
>> "!TRAIN_DIR!\README.txt" echo.
>> "!TRAIN_DIR!\README.txt" echo  CONFIGS:
>> "!TRAIN_DIR!\README.txt" echo    Kohya:  C:\_AI\kohya_ss\configs\
>> "!TRAIN_DIR!\README.txt" echo    Musubi: C:\_AI\musubi-tuner\configs\
>> "!TRAIN_DIR!\README.txt" echo ============================================================

echo  [OK] Training data skeleton at !TRAIN_DIR!
goto :eof

:std_already
echo  [OK] Training data folder exists
goto :eof

:: --- Performance Guide ---
:create_performance_guide
set "_PG=!BASE_DIR!\PERFORMANCE_GUIDE.txt"
if exist "!_PG!" goto :pg_already

:: Auto-detect hardware for the guide
set "_PG_VRAM=0"
for /f "tokens=*" %%V in ('nvidia-smi --query-gpu^=memory.total --format^=csv^,noheader^,nounits 2^>nul') do set "_PG_VRAM=%%V"
set "_PG_VRAM=!_PG_VRAM: =!"
if "!_PG_VRAM!"=="0" set "_PG_VRAM=32768"
set "_PG_RAM=0"
for /f "skip=1 tokens=*" %%R in ('wmic computersystem get totalphysicalmemory 2^>nul') do if "!_PG_RAM!"=="0" set /a "_PG_RAM=%%R / 1073741824"
if "!_PG_RAM!"=="0" set "_PG_RAM=96"
set "_PG_GPU=Unknown"
for /f "tokens=2 delims=:" %%G in ('nvidia-smi -L 2^>nul') do if "!_PG_GPU!"=="Unknown" set "_PG_GPU=%%G"

echo  [CREATE] PERFORMANCE_GUIDE.txt
> "!_PG!" echo ============================================================
>> "!_PG!" echo  RTX 5090 AI STACK - PERFORMANCE GUIDE
>> "!_PG!" echo  Auto-generated by RTX5090_FULL_SETUP.bat on %date%
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  DETECTED HARDWARE
>> "!_PG!" echo  -----------------
>> "!_PG!" echo  GPU:  !_PG_GPU!
>> "!_PG!" echo  VRAM: !_PG_VRAM! MB
>> "!_PG!" echo  RAM:  !_PG_RAM! GB
>> "!_PG!" echo.
>> "!_PG!" echo ============================================================
>> "!_PG!" echo  1. WHAT'S ALREADY AUTO-CONFIGURED
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  The launchers (LAUNCH_ComfyUI.bat, LAUNCH_SwarmUI.bat) set:
>> "!_PG!" echo.
>> "!_PG!" echo  ENVIRONMENT VARIABLES (inherited by all child processes):
>> "!_PG!" echo    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
>> "!_PG!" echo      Prevents CUDA memory fragmentation in long sessions
>> "!_PG!" echo    CUDA_MODULE_LOADING=LAZY
>> "!_PG!" echo      Faster cold startup (loads CUDA kernels on demand)
>> "!_PG!" echo    HF_HUB_ENABLE_HF_TRANSFER=1
>> "!_PG!" echo      5-10x faster model downloads from HuggingFace
>> "!_PG!" echo    TORCH_CUDNN_V8_API_ENABLED=1
>> "!_PG!" echo      Uses newer cuDNN API for marginal speed gains
>> "!_PG!" echo.
>> "!_PG!" echo  COMFYUI LAUNCH ARGS (auto-selected by VRAM profile):
>> "!_PG!" echo    --gpu-only        Keep ALL tensors in VRAM (no CPU offload)
>> "!_PG!" echo    --cuda-malloc     Faster async CUDA memory allocation
>> "!_PG!" echo    --fast            FP8 fast inference (native on Blackwell)
>> "!_PG!" echo    --reserve-vram 0.5  Only reserve 0.5GB for system overhead
>> "!_PG!" echo    --preview-method auto  Live generation previews
>> "!_PG!" echo    --auto-launch     Opens browser automatically
>> "!_PG!" echo.
>> "!_PG!" echo  SWARMUI SETTINGS (Data/Settings/Performance.fds):
>> "!_PG!" echo    MaxModelsToCache: 5
>> "!_PG!" echo    MaxModelRAMCacheSizeMB: based on 80%% of system RAM
>> "!_PG!" echo    ImageOutputFormat: webp (60%% smaller than PNG)
>> "!_PG!" echo    SaveMetadataInImages: true
>> "!_PG!" echo.
>> "!_PG!" echo  VRAM PROFILES (auto-detected at launch):
>> "!_PG!" echo    Ultra (32GB+):  --gpu-only --cuda-malloc --fast
>> "!_PG!" echo    High  (16-31):  --highvram --cuda-malloc --fast
>> "!_PG!" echo    Medium (8-15):  --normalvram --cuda-malloc --fp8_e4m3fn-unet
>> "!_PG!" echo    Low   (below):  --preview-method auto --auto-launch only
>> "!_PG!" echo.
>> "!_PG!" echo ============================================================
>> "!_PG!" echo  2. MANUAL SWARMUI SETTINGS (configure in web UI)
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  After launching SwarmUI, go to Settings tab:
>> "!_PG!" echo.
>> "!_PG!" echo  Server -^> Backends:
>> "!_PG!" echo    Backend Type:         ComfyUI (Self-Start)
>> "!_PG!" echo    Extra Args:           --gpu-only --cuda-malloc --fast --reserve-vram 0.5
>> "!_PG!" echo    (Auto-configured in Backends.fds on fresh install, or set manually)
>> "!_PG!" echo.
>> "!_PG!" echo  Server -^> Performance:
>> "!_PG!" echo    Max Simultaneous:     2-3 for SDXL, 1 for FLUX
>> "!_PG!" echo    Model RAM Cache:      80 GB (keep models in RAM for instant swaps)
>> "!_PG!" echo.
>> "!_PG!" echo  Output:
>> "!_PG!" echo    Format:               WebP at quality 95
>> "!_PG!" echo    Metadata:             Enabled (embed gen params in images)
>> "!_PG!" echo.
>> "!_PG!" echo ============================================================
>> "!_PG!" echo  3. RECOMMENDED GENERATION DEFAULTS
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  +-----------+-------------------+-------------------+
>> "!_PG!" echo  :           : SDXL              : FLUX              :
>> "!_PG!" echo  +-----------+-------------------+-------------------+
>> "!_PG!" echo  : Resolution: 1024x1024         : 1024x1024         :
>> "!_PG!" echo  : Max Res   : 1536x1536 (easy)  : 1280x1280         :
>> "!_PG!" echo  : Batch     : 4 at 1024x1024    : 1-2 at 1024x1024  :
>> "!_PG!" echo  : Steps     : 25                : 20                :
>> "!_PG!" echo  : CFG       : 7.0               : 1.0 (guided)      :
>> "!_PG!" echo  : Sampler   : DPM++ 2M Karras   : Euler             :
>> "!_PG!" echo  : Scheduler : Karras            : Normal            :
>> "!_PG!" echo  : VRAM used : ~6 GB/gen         : ~20 GB (FP16)     :
>> "!_PG!" echo  : w/ FP8    : ~3 GB/gen         : ~12 GB (native!)  :
>> "!_PG!" echo  +-----------+-------------------+-------------------+
>> "!_PG!" echo.
>> "!_PG!" echo ============================================================
>> "!_PG!" echo  4. MODEL LOADING STRATEGY (YOUR 96GB RAM ADVANTAGE)
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  With !_PG_RAM! GB system RAM and model caching enabled:
>> "!_PG!" echo.
>> "!_PG!" echo    Disk (NVMe) --^> RAM Cache (!_PG_RAM!GB) --^> VRAM (!_PG_VRAM!MB)
>> "!_PG!" echo       slow            fast (~2sec)          instant
>> "!_PG!" echo.
>> "!_PG!" echo  First load:       Disk to RAM to VRAM (~15-30 sec for FLUX)
>> "!_PG!" echo  Subsequent swap:  RAM to VRAM (~1-3 sec because model stays cached)
>> "!_PG!" echo.
>> "!_PG!" echo  You can cache simultaneously:
>> "!_PG!" echo    SDXL base (~6.5 GB) + FLUX.1-dev (~23 GB) + 2 LoRAs +
>> "!_PG!" echo    VAE + ControlNet + IP-Adapter = ~40 GB
>> "!_PG!" echo    Still leaves ~56 GB free for OS and other apps
>> "!_PG!" echo.
>> "!_PG!" echo ============================================================
>> "!_PG!" echo  5. CONTROLNET / IP-ADAPTER STACKING (32GB VRAM)
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  With 32GB VRAM you can stack models smaller GPUs can't:
>> "!_PG!" echo.
>> "!_PG!" echo  SDXL stack example:
>> "!_PG!" echo    SDXL base       ~6.0 GB
>> "!_PG!" echo    + ControlNet    ~2.5 GB
>> "!_PG!" echo    + IP-Adapter    ~2.5 GB
>> "!_PG!" echo    + LoRA          ~0.2 GB
>> "!_PG!" echo    = Total         ~11.2 GB  (21GB headroom for batch/upscale)
>> "!_PG!" echo.
>> "!_PG!" echo  FLUX stack example:
>> "!_PG!" echo    FLUX FP8        ~12 GB
>> "!_PG!" echo    + ControlNet    ~3.5 GB
>> "!_PG!" echo    + LoRA          ~0.4 GB
>> "!_PG!" echo    = Total         ~16 GB   (16GB headroom)
>> "!_PG!" echo.
>> "!_PG!" echo ============================================================
>> "!_PG!" echo  6. TRAINING SETTINGS (KOHYA / MUSUBI)
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  Your RTX 5090 has native FP8 support. Key training settings:
>> "!_PG!" echo.
>> "!_PG!" echo  SDXL LoRA:
>> "!_PG!" echo    - mixed_precision: bf16
>> "!_PG!" echo    - train_batch_size: 4-6  (32GB allows large batches)
>> "!_PG!" echo    - gradient_checkpointing: true
>> "!_PG!" echo    - resolution: 1024
>> "!_PG!" echo.
>> "!_PG!" echo  FLUX LoRA:
>> "!_PG!" echo    - mixed_precision: bf16
>> "!_PG!" echo    - fp8_base: true  (native on Blackwell - no speed penalty!)
>> "!_PG!" echo    - train_batch_size: 1-2
>> "!_PG!" echo    - gradient_checkpointing: true
>> "!_PG!" echo    - cache_text_encoder_outputs_to_disk: true
>> "!_PG!" echo.
>> "!_PG!" echo  Video LoRA (HunyuanVideo / Wan2.1):
>> "!_PG!" echo    - mixed_precision: bf16
>> "!_PG!" echo    - fp8_base: true
>> "!_PG!" echo    - train_batch_size: 1
>> "!_PG!" echo    - gradient_checkpointing: true
>> "!_PG!" echo    - target_frames: 17 (HunyuanVideo) / 16 (Wan2.1)
>> "!_PG!" echo.
>> "!_PG!" echo  Sample configs are in:
>> "!_PG!" echo    C:\_AI\kohya_ss\configs\   (SDXL, FLUX)
>> "!_PG!" echo    C:\_AI\musubi-tuner\configs\  (HunyuanVideo, Wan2.1)
>> "!_PG!" echo.
>> "!_PG!" echo ============================================================
>> "!_PG!" echo  7. TROUBLESHOOTING
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  Out of VRAM:
>> "!_PG!" echo    - Switch to FP8 (--fast flag or fp8_base in training)
>> "!_PG!" echo    - Reduce batch size
>> "!_PG!" echo    - Enable VAE tiling for high-res images
>> "!_PG!" echo    - Lower resolution
>> "!_PG!" echo.
>> "!_PG!" echo  Slow model swaps:
>> "!_PG!" echo    - Check RAM cache is enabled in SwarmUI settings
>> "!_PG!" echo    - Set MaxModelRAMCacheSizeMB to 80000 (80GB)
>> "!_PG!" echo    - First load is always slow (disk), subsequent swaps are fast
>> "!_PG!" echo.
>> "!_PG!" echo  CUDA errors on launch:
>> "!_PG!" echo    - PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True fixes most
>> "!_PG!" echo    - Restart your PC to clear stuck CUDA contexts
>> "!_PG!" echo    - Check nvidia-smi for other processes using VRAM
>> "!_PG!" echo.
>> "!_PG!" echo  Generation quality:
>> "!_PG!" echo    - FP8 on Blackwell has negligible quality impact
>> "!_PG!" echo    - Use FP16/BF16 only if you notice quality issues
>> "!_PG!" echo    - More steps != better quality past 25 (SDXL) / 20 (FLUX)
>> "!_PG!" echo.
>> "!_PG!" echo ============================================================
>> "!_PG!" echo  FILES REFERENCE
>> "!_PG!" echo ============================================================
>> "!_PG!" echo.
>> "!_PG!" echo  Launchers:
>> "!_PG!" echo    C:\_AI\ComfyUI\LAUNCH_ComfyUI.bat
>> "!_PG!" echo    C:\_AI\SwarmUI\LAUNCH_SwarmUI.bat
>> "!_PG!" echo    C:\_AI\kohya_ss\LAUNCH_Kohya.bat
>> "!_PG!" echo    C:\_AI\musubi-tuner\LAUNCH_Musubi.bat
>> "!_PG!" echo.
>> "!_PG!" echo  Settings:
>> "!_PG!" echo    C:\_AI\SwarmUI\Data\Settings\Performance.fds
>> "!_PG!" echo    C:\_AI\SwarmUI\Data\Settings\Model-Paths.fds
>> "!_PG!" echo    C:\_AI\ComfyUI\extra_model_paths.yaml
>> "!_PG!" echo.
>> "!_PG!" echo  Models (shared):
>> "!_PG!" echo    C:\_AI\models\
>> "!_PG!" echo.
>> "!_PG!" echo  This guide:
>> "!_PG!" echo    C:\_AI\PERFORMANCE_GUIDE.txt
>> "!_PG!" echo ============================================================

echo  [OK] PERFORMANCE_GUIDE.txt created
goto :eof

:pg_already
echo  [OK] PERFORMANCE_GUIDE.txt exists
goto :eof

:: ############################################################
:: #   CUSTOM NODES + MODELS                                  #
:: ############################################################
:phase_nodes_models
echo.
echo  =============================================================
echo   CUSTOM NODES + MODELS
echo  =============================================================
echo.

if not exist "!COMFYUI_DIR!\main.py" goto :nodes_skip_no_comfy

:: --- CUSTOM NODES ---
echo  Custom Nodes for ComfyUI:
echo.
echo  [1] Install ALL recommended nodes
echo  [2] Pick which nodes to install
echo  [3] Update existing nodes only
echo  [4] Skip nodes
echo.
set /p NODE_CHOICE="  Choice: "

if "!NODE_CHOICE!"=="1" goto :nodes_all
if "!NODE_CHOICE!"=="2" goto :nodes_pick
if "!NODE_CHOICE!"=="3" goto :nodes_update
if "!NODE_CHOICE!"=="4" goto :nodes_skip
goto :nodes_skip

:nodes_skip_no_comfy
echo  [SKIP] ComfyUI not installed. Install ComfyUI first.
goto :eof

:nodes_all
set "_cn_num=0"
set "_cn_total=22"
set "_cn_warn=0"
set "_cn_installed=0"
set "_cn_updated=0"
call :get_ts
set "_cn_start=!_TS!"
call :install_node "ComfyUI-Manager" "https://github.com/ltdrdata/ComfyUI-Manager.git"
call :install_node "ComfyUI-Impact-Pack" "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git"
call :install_node "ComfyUI-Inspire-Pack" "https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git"
call :install_node "ComfyUI-KJNodes" "https://github.com/kijai/ComfyUI-KJNodes.git"
call :install_node "ComfyUI-GGUF" "https://github.com/city96/ComfyUI-GGUF.git"
call :install_node "ComfyUI-Custom-Scripts" "https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git"
call :install_node "was-node-suite-comfyui" "https://github.com/WASasquatch/was-node-suite-comfyui.git"
call :install_node "ComfyUI-VideoHelperSuite" "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git"
call :install_node "ComfyUI-Advanced-ControlNet" "https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet.git"
call :install_node "comfyui_controlnet_aux" "https://github.com/Fannovel16/comfyui_controlnet_aux.git"
call :install_node "ComfyUI-AnimateDiff-Evolved" "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git"
call :install_node "ComfyUI-Florence2" "https://github.com/kijai/ComfyUI-Florence2.git"
call :install_node "rgthree-comfy" "https://github.com/rgthree/rgthree-comfy.git"
call :install_node "efficiency-nodes-comfyui" "https://github.com/jags111/efficiency-nodes-comfyui.git"
call :install_node "ComfyUI_IPAdapter_plus" "https://github.com/cubiq/ComfyUI_IPAdapter_plus.git"
call :install_node "ComfyUI-Easy-Use" "https://github.com/yolain/ComfyUI-Easy-Use.git"
call :install_node "ComfyUI_essentials" "https://github.com/cubiq/ComfyUI_essentials.git"
call :install_node "ComfyUI-Frame-Interpolation" "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git"
call :install_node "ComfyUI_FizzNodes" "https://github.com/FizzleDorf/ComfyUI_FizzNodes.git"
call :install_node "ComfyUI-Crystools" "https://github.com/crystian/ComfyUI-Crystools.git"
call :install_node "comfyui-reactor-node" "https://github.com/Gourieff/comfyui-reactor-node.git"
call :install_node "ComfyUI-FaceID-Plus" "https://github.com/cubiq/ComfyUI-FaceID-Plus.git"
call :get_ts
call :calc_elapsed !_cn_start! !_TS!
set /a "_cn_ok=!_cn_installed! + !_cn_updated!"
call :show_summary_nodes !_cn_total! !_cn_installed! !_cn_updated! !_cn_warn! "!_ELAPSED!"
goto :nodes_skip

:nodes_pick
echo.
echo  --- Pick nodes to install ---
echo  Press Y to install, N to skip each:
echo.
call :ask_node "ComfyUI-Manager" "https://github.com/ltdrdata/ComfyUI-Manager.git" "ESSENTIAL - node package manager"
call :ask_node "ComfyUI-Impact-Pack" "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git" "detailer, SAM, bbox"
call :ask_node "ComfyUI-Inspire-Pack" "https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git" "prompt utilities"
call :ask_node "ComfyUI-KJNodes" "https://github.com/kijai/ComfyUI-KJNodes.git" "utility nodes"
call :ask_node "ComfyUI-GGUF" "https://github.com/city96/ComfyUI-GGUF.git" "GGUF model loading"
call :ask_node "ComfyUI-Custom-Scripts" "https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git" "workflow tools"
call :ask_node "was-node-suite-comfyui" "https://github.com/WASasquatch/was-node-suite-comfyui.git" "100+ utility nodes"
call :ask_node "ComfyUI-VideoHelperSuite" "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git" "video I/O"
call :ask_node "ComfyUI-Advanced-ControlNet" "https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet.git" "ControlNet tools"
call :ask_node "comfyui_controlnet_aux" "https://github.com/Fannovel16/comfyui_controlnet_aux.git" "preprocessors"
call :ask_node "ComfyUI-AnimateDiff-Evolved" "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git" "animation"
call :ask_node "ComfyUI-Florence2" "https://github.com/kijai/ComfyUI-Florence2.git" "captioning"
call :ask_node "rgthree-comfy" "https://github.com/rgthree/rgthree-comfy.git" "workflow organizer"
call :ask_node "ComfyUI_IPAdapter_plus" "https://github.com/cubiq/ComfyUI_IPAdapter_plus.git" "IP-Adapter"
call :ask_node "ComfyUI-Easy-Use" "https://github.com/yolain/ComfyUI-Easy-Use.git" "simplified workflows"
call :ask_node "ComfyUI_essentials" "https://github.com/cubiq/ComfyUI_essentials.git" "essential tools"
call :ask_node "ComfyUI-Crystools" "https://github.com/crystian/ComfyUI-Crystools.git" "debug + monitor"
call :ask_node "comfyui-reactor-node" "https://github.com/Gourieff/comfyui-reactor-node.git" "face swap - ReActor"
call :ask_node "ComfyUI-FaceID-Plus" "https://github.com/cubiq/ComfyUI-FaceID-Plus.git" "FaceID + IP-Adapter"
goto :nodes_skip

:nodes_update
echo  [UPDATE] Existing custom nodes...
if not exist "!COMFYUI_DIR!\custom_nodes" goto :nodes_skip
:: Pre-count git directories
set "_nu_total=0"
for /d %%D in ("!COMFYUI_DIR!\custom_nodes\*") do if exist "%%D\.git" set /a _nu_total+=1
set "_nu_num=0"
set "_nu_warn=0"
call :get_ts
set "_nu_start=!_TS!"
for /d %%D in ("!COMFYUI_DIR!\custom_nodes\*") do call :update_one_node "%%D"
call :get_ts
call :calc_elapsed !_nu_start! !_TS!
set /a "_nu_ok=!_nu_num! - !_nu_warn!"
call :show_summary "Node Updates" !_nu_total! !_nu_ok! !_nu_warn! "!_ELAPSED!"

:nodes_skip
echo.

:: --- MODELS ---
echo  -------------------------------------------------------
echo   MODEL DOWNLOADS
echo  -------------------------------------------------------
echo.
echo  Models go to: !MODELS_DIR!
echo.
echo  [1] Download essential starter models
echo  [2] Pick models to download
echo  [3] Skip models
echo.
set /p MODEL_CHOICE="  Choice: "

if "!MODEL_CHOICE!"=="1" goto :models_essential
if "!MODEL_CHOICE!"=="2" goto :models_pick
goto :models_done

:models_essential
echo.
echo  --- Essential Models ---
echo  These are downloaded from HuggingFace using huggingface-cli.
echo.

:: Check huggingface-cli + enable fast Rust-based transfers
call !PY_CMD! -m pip install --upgrade huggingface-hub hf_transfer --quiet >nul 2>&1
set "HF_HUB_ENABLE_HF_TRANSFER=1"

set "_mdl_num=0"
set "_mdl_total=3"
set "_mdl_warn=0"
call :get_ts
set "_mdl_start=!_TS!"

:: SDXL
call :download_hf_model "stabilityai/stable-diffusion-xl-base-1.0" "sd_xl_base_1.0.safetensors" "!MODELS_DIR!\checkpoints" "SDXL Base"
call :download_hf_model "stabilityai/sdxl-vae" "sdxl_vae.safetensors" "!MODELS_DIR!\vae" "SDXL VAE"

:: FLUX
call :download_hf_model "black-forest-labs/FLUX.1-schnell" "flux1-schnell.safetensors" "!MODELS_DIR!\unet" "FLUX.1 Schnell"

call :get_ts
call :calc_elapsed !_mdl_start! !_TS!
set /a "_mdl_ok=!_mdl_total! - !_mdl_warn!"
call :show_summary "Model Downloads" !_mdl_total! !_mdl_ok! !_mdl_warn! "!_ELAPSED!"

echo.
echo  [INFO] For FLUX.1-dev and larger models, use ComfyUI-Manager
echo         or download manually from HuggingFace/Civitai.
echo.
goto :models_done

:models_pick
echo.
echo  --- Pick models ---
echo  Press Y to download, N to skip:
echo.

call :ask_model "stabilityai/stable-diffusion-xl-base-1.0" "sd_xl_base_1.0.safetensors" "!MODELS_DIR!\checkpoints" "SDXL Base 1.0 - 6.9 GB"
call :ask_model "stabilityai/sdxl-vae" "sdxl_vae.safetensors" "!MODELS_DIR!\vae" "SDXL VAE"
call :ask_model "black-forest-labs/FLUX.1-schnell" "flux1-schnell.safetensors" "!MODELS_DIR!\unet" "FLUX.1 Schnell - 23 GB"

:models_done
echo.
goto :eof

:: --- Helper: install one custom node ---
:install_node
set "NODE_NAME=%~1"
set "NODE_URL=%~2"
set "NODE_DIR=!COMFYUI_DIR!\custom_nodes\!NODE_NAME!"
set /a _cn_num+=1

if exist "!NODE_DIR!" goto :in_update
:: Fresh install
call git clone "!NODE_URL!" "!NODE_DIR!" --depth 1 --quiet >nul 2>&1
if !errorlevel! neq 0 goto :in_fail
pushd "!NODE_DIR!"
if exist "requirements.txt" call !PY_CMD! -m pip install -r requirements.txt --quiet >nul 2>&1
popd
set /a _cn_installed+=1
call :make_bar !_cn_num! !_cn_total!
echo   !_BAR_LINE!  !NODE_NAME! .. installed
goto :eof

:in_update
pushd "!NODE_DIR!"
call :smart_pull_quiet
if "!_PULL_CHANGED!"=="1" if exist "requirements.txt" call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet >nul 2>&1
popd
set /a _cn_updated+=1
call :make_bar !_cn_num! !_cn_total!
echo   !_BAR_LINE!  !NODE_NAME! .. updated
goto :eof

:in_fail
set /a _cn_warn+=1
call :make_bar !_cn_num! !_cn_total!
echo   !_BAR_LINE!  !NODE_NAME! .. FAILED
goto :eof

:: --- Helper: update one node from for loop ---
:update_one_node
set "UON_DIR=%~1"
if not exist "%~1\.git" goto :eof
set /a _nu_num+=1
pushd "%~1"
call :smart_pull_quiet
if "!_PULL_CHANGED!"=="1" if exist "requirements.txt" call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet >nul 2>&1
popd
call :make_bar !_nu_num! !_nu_total!
if "!_PULL_CHANGED!"=="0" echo   !_BAR_LINE!  %~nx1 .. ok
if "!_PULL_CHANGED!"=="1" echo   !_BAR_LINE!  %~nx1 .. updated
goto :eof

:: --- Helper: ask then install node ---
:ask_node
set "AN_NAME=%~1"
set "AN_URL=%~2"
set "AN_DESC=%~3"
set "AN_DIR=!COMFYUI_DIR!\custom_nodes\!AN_NAME!"

if exist "!AN_DIR!" goto :an_already
set /p AN_YN="  !AN_NAME! - !AN_DESC! (Y/N): "
if /i "!AN_YN!"=="Y" call :install_node "!AN_NAME!" "!AN_URL!"
goto :eof

:an_already
echo  [OK] !AN_NAME! - already installed
goto :eof

:: --- Helper: download HuggingFace model ---
:download_hf_model
set "HF_REPO=%~1"
set "HF_FILE=%~2"
set "HF_DIR=%~3"
set "HF_DESC=%~4"
set /a _mdl_num+=1

if not exist "!HF_DIR!" mkdir "!HF_DIR!"

if exist "!HF_DIR!\!HF_FILE!" goto :hf_already

echo  [DOWNLOAD] !HF_DESC!...
echo             From: !HF_REPO! / !HF_FILE!
call !PY_CMD! -c "from huggingface_hub import hf_hub_download; hf_hub_download('!HF_REPO!', '!HF_FILE!', local_dir=r'!HF_DIR!')" 2>nul
if !errorlevel! equ 0 goto :hf_ok
set /a _mdl_warn+=1
call :make_bar !_mdl_num! !_mdl_total!
echo   !_BAR_LINE!  !HF_DESC! .. FAILED
goto :eof

:hf_already
call :make_bar !_mdl_num! !_mdl_total!
echo   !_BAR_LINE!  !HF_DESC! .. already have
goto :eof

:hf_ok
call :make_bar !_mdl_num! !_mdl_total!
echo   !_BAR_LINE!  !HF_DESC! .. downloaded
goto :eof

:: --- Helper: ask then download model ---
:ask_model
set "AM_REPO=%~1"
set "AM_FILE=%~2"
set "AM_DIR=%~3"
set "AM_DESC=%~4"

if exist "!AM_DIR!\!AM_FILE!" goto :am_already
set /p AM_YN="  !AM_DESC! (Y/N): "
if /i "!AM_YN!"=="Y" call :download_hf_model "!AM_REPO!" "!AM_FILE!" "!AM_DIR!" "!AM_DESC!"
goto :eof

:am_already
echo  [OK] !AM_DESC! - already have it
goto :eof

:: ############################################################
:: #   SWARMUI                                                #
:: ############################################################
:phase_swarmui
echo.
echo  =============================================================
echo   SWARMUI
echo  =============================================================
echo  SWARMUI >> "!LOG!"
echo.

if exist "!SWARMUI_DIR!\launchtools" goto :swarm_update

:: --- FRESH INSTALL ---
echo  [INSTALL] SwarmUI - fresh install...
echo.
if exist "!SWARMUI_DIR!\*" rmdir /s /q "!SWARMUI_DIR!" 2>nul
call git clone https://github.com/mcmonkeyprojects/SwarmUI.git "!SWARMUI_DIR!" --depth 1
if !errorlevel! neq 0 goto :swarm_clone_fail

pushd "!SWARMUI_DIR!"
call git submodule update --init --recursive
popd

echo  [OK] SwarmUI cloned

:: Point SwarmUI to shared models
call :setup_swarmui_models

:: Create launcher
call :create_swarmui_launcher

set "HAS_SWARMUI=1"
echo  [OK] SwarmUI installed!
echo  [NOTE] First launch will complete .NET build + ComfyUI backend setup.
goto :eof

:swarm_clone_fail
echo  [ERROR] Git clone failed!
goto :eof

:swarm_update
echo  [UPDATE] SwarmUI...
pushd "!SWARMUI_DIR!"
call :smart_pull
if "!_PULL_CHANGED!"=="1" call git submodule update --init --recursive --quiet 2>nul
if "!_PULL_CHANGED!"=="0" echo  [SKIP] Already up to date
popd
echo  [OK] SwarmUI updated
call :setup_swarmui_models
call :create_swarmui_launcher
goto :eof

:update_swarmui
if "!HAS_SWARMUI!"=="0" goto :eof
echo  [UPDATE] SwarmUI...
pushd "!SWARMUI_DIR!"
call :smart_pull_quiet
if "!_PULL_CHANGED!"=="1" call git submodule update --init --recursive --quiet 2>nul
popd
if "!_PULL_CHANGED!"=="0" echo  [OK] SwarmUI (no changes)
if "!_PULL_CHANGED!"=="1" echo  [OK] SwarmUI (updated)
goto :eof

:create_swarmui_launcher
:: Fallback defaults if :check_nvidia didn't run or failed
if "!DETECTED_VRAM_MB!"=="" set "DETECTED_VRAM_MB=32768"
if "!DETECTED_RAM_GB!"=="" set "DETECTED_RAM_GB=96"
if "!VRAM_PROFILE!"=="" set "VRAM_PROFILE=Ultra"

:: Compute model cache from detected RAM
set /a "_CACHE_GB=!DETECTED_RAM_GB! * 80 / 100"

set "_SL=!SWARMUI_DIR!\LAUNCH_SwarmUI.bat"
> "!_SL!" echo @echo off
>> "!_SL!" echo title SwarmUI - RTX 5090
>> "!_SL!" echo color 0E
>> "!_SL!" echo :: --- Performance environment variables ---
>> "!_SL!" echo :: These are inherited by SwarmUI's internal ComfyUI backend
>> "!_SL!" echo set "PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True"
>> "!_SL!" echo set "CUDA_MODULE_LOADING=LAZY"
>> "!_SL!" echo set "HF_HUB_ENABLE_HF_TRANSFER=1"
>> "!_SL!" echo set "TORCH_CUDNN_V8_API_ENABLED=1"
>> "!_SL!" echo echo.
>> "!_SL!" echo echo  ========================================
>> "!_SL!" echo echo   SwarmUI - RTX 5090 Optimized
>> "!_SL!" echo echo  ========================================
>> "!_SL!" echo echo   VRAM: !DETECTED_VRAM_MB! MB  RAM: !DETECTED_RAM_GB! GB
>> "!_SL!" echo echo   Profile: !VRAM_PROFILE!  Cache: !_CACHE_GB! GB
>> "!_SL!" echo echo  ========================================
>> "!_SL!" echo echo.
>> "!_SL!" echo echo  [1] Launch SwarmUI
>> "!_SL!" echo echo  [2] Update + Launch
>> "!_SL!" echo echo.
>> "!_SL!" echo set /p C="  Choice: "
>> "!_SL!" echo if "%%C%%"=="2" goto :do_update
>> "!_SL!" echo goto :do_launch
>> "!_SL!" echo :do_update
>> "!_SL!" echo cd /d "!SWARMUI_DIR!"
>> "!_SL!" echo call git pull
>> "!_SL!" echo call git submodule update --init --recursive
>> "!_SL!" echo echo  [OK] Updated - launching...
>> "!_SL!" echo goto :do_launch
>> "!_SL!" echo :do_launch
>> "!_SL!" echo cd /d "!SWARMUI_DIR!"
>> "!_SL!" echo echo.
>> "!_SL!" echo echo  Starting SwarmUI...
>> "!_SL!" echo echo  http://localhost:7801
>> "!_SL!" echo echo.
>> "!_SL!" echo call launch-windows.bat
>> "!_SL!" echo pause

echo  [OK] LAUNCH_SwarmUI.bat created
goto :eof

:: --- SwarmUI shared models ---
:setup_swarmui_models
:: Ensure shared models dir exists
if not exist "!MODELS_DIR!" call :setup_shared_models

:: SwarmUI's internal ComfyUI backend path (created on first launch)
set "SWARM_COMFY=!SWARMUI_DIR!\dlbackend\comfyui\ComfyUI"

:: If SwarmUI's ComfyUI backend exists, add extra_model_paths.yaml
if not exist "!SWARM_COMFY!" goto :ssm_settings
echo  [SETUP] SwarmUI ComfyUI backend -> shared models...
> "!SWARM_COMFY!\extra_model_paths.yaml" echo # Auto-generated by RTX5090_FULL_SETUP.bat
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo # Points SwarmUI's ComfyUI backend to shared models
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo shared:
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     base_path: !MODELS_DIR!
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     checkpoints: checkpoints
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     vae: vae
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     loras: loras
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     controlnet: controlnet
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     clip: clip
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     clip_vision: clip_vision
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     upscale_models: upscale_models
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     embeddings: embeddings
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     ipadapter: ipadapter
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     unet: unet
>> "!SWARM_COMFY!\extra_model_paths.yaml" echo     diffusion_models: diffusion_models
echo  [OK] SwarmUI ComfyUI backend linked to shared models

:ssm_settings
:: Also configure SwarmUI's own model paths via settings
:: SwarmUI reads ModelRoot from Data/Settings/
set "SWARM_DATA=!SWARMUI_DIR!\Data\Settings"
if not exist "!SWARM_DATA!" mkdir "!SWARM_DATA!" 2>nul
:: Only create if no settings exist yet (don't overwrite user config)
if exist "!SWARM_DATA!\Model-Paths.fds" goto :ssm_already
> "!SWARM_DATA!\Model-Paths.fds" echo # Auto-generated by RTX5090_FULL_SETUP.bat
>> "!SWARM_DATA!\Model-Paths.fds" echo # Points SwarmUI to shared models folder
>> "!SWARM_DATA!\Model-Paths.fds" echo ModelRoot: !MODELS_DIR!
echo  [OK] SwarmUI model root -> !MODELS_DIR!
goto :ssm_perf

:ssm_already
echo  [OK] SwarmUI model paths already configured
goto :ssm_perf

:ssm_perf
:: --- SwarmUI performance settings ---
:: Only create if not already configured
if exist "!SWARM_DATA!\Performance.fds" goto :ssm_perf_done
:: Auto-detect system RAM for model cache sizing
set "_SYS_RAM_GB=0"
for /f "skip=1 tokens=*" %%R in ('wmic computersystem get totalphysicalmemory 2^>nul') do if "!_SYS_RAM_GB!"=="0" set /a "_SYS_RAM_GB=%%R / 1073741824"
if "!_SYS_RAM_GB!"=="0" set "_SYS_RAM_GB=96"
:: Use 80% of RAM for model cache
set /a "_MODEL_CACHE_GB=!_SYS_RAM_GB! * 80 / 100"
:: Auto-detect VRAM
set "_SYS_VRAM_MB=0"
for /f "tokens=*" %%V in ('nvidia-smi --query-gpu^=memory.total --format^=csv^,noheader^,nounits 2^>nul') do set "_SYS_VRAM_MB=%%V"
set "_SYS_VRAM_MB=!_SYS_VRAM_MB: =!"
if "!_SYS_VRAM_MB!"=="0" set "_SYS_VRAM_MB=32768"

echo  [SETUP] SwarmUI performance settings...
echo       System RAM: !_SYS_RAM_GB! GB  VRAM: !_SYS_VRAM_MB! MB
echo       Model cache: !_MODEL_CACHE_GB! GB

> "!SWARM_DATA!\Performance.fds" echo # Auto-generated by RTX5090_FULL_SETUP.bat
>> "!SWARM_DATA!\Performance.fds" echo # Performance settings optimized for your hardware
>> "!SWARM_DATA!\Performance.fds" echo # System RAM: !_SYS_RAM_GB! GB  VRAM: !_SYS_VRAM_MB! MB
>> "!SWARM_DATA!\Performance.fds" echo #
>> "!SWARM_DATA!\Performance.fds" echo # Model cache: keep models in system RAM for instant swaps
>> "!SWARM_DATA!\Performance.fds" echo # (first load from disk is slow, subsequent swaps are ~2 sec)
>> "!SWARM_DATA!\Performance.fds" echo MaxModelsToCache: 5
>> "!SWARM_DATA!\Performance.fds" echo MaxModelRAMCacheSizeMB: !_MODEL_CACHE_GB!000
>> "!SWARM_DATA!\Performance.fds" echo #
>> "!SWARM_DATA!\Performance.fds" echo # Image output format (WebP is 60%% smaller than PNG, visually identical)
>> "!SWARM_DATA!\Performance.fds" echo ImageOutputFormat: webp
>> "!SWARM_DATA!\Performance.fds" echo ImageOutputQuality: 95
>> "!SWARM_DATA!\Performance.fds" echo #
>> "!SWARM_DATA!\Performance.fds" echo # Preview during generation
>> "!SWARM_DATA!\Performance.fds" echo PreviewType: OneFewSteps
>> "!SWARM_DATA!\Performance.fds" echo #
>> "!SWARM_DATA!\Performance.fds" echo # Save metadata in images for reproducibility
>> "!SWARM_DATA!\Performance.fds" echo SaveMetadataInImages: true

echo  [OK] SwarmUI performance settings configured
goto :ssm_backends

:ssm_perf_done
echo  [OK] SwarmUI performance settings already configured
goto :ssm_backends

:ssm_backends
:: --- SwarmUI ComfyUI backend args ---
:: Configure the self-start ComfyUI backend with optimized launch args
:: Only create if no backends file exists yet (don't overwrite user config)
set "_SWARM_BK=!SWARMUI_DIR!\Data\Backends.fds"
if exist "!_SWARM_BK!" goto :ssm_bk_exists

:: Fallback defaults
if "!VRAM_PROFILE!"=="" set "VRAM_PROFILE=Ultra"

:: Determine backend extra args based on profile
set "_BK_ARGS="
if "!VRAM_PROFILE!"=="Medium" set "_BK_ARGS=--normalvram --cuda-malloc --fp8_e4m3fn-unet"
if "!VRAM_PROFILE!"=="High" set "_BK_ARGS=--highvram --cuda-malloc --fast"
if "!VRAM_PROFILE!"=="Ultra" set "_BK_ARGS=--gpu-only --cuda-malloc --fast --reserve-vram 0.5"

echo  [SETUP] SwarmUI backend config (ComfyUI extra args)...
if not exist "!SWARMUI_DIR!\Data" mkdir "!SWARMUI_DIR!\Data" 2>nul

> "!_SWARM_BK!" echo # Auto-generated by RTX5090_FULL_SETUP.bat
>> "!_SWARM_BK!" echo # ComfyUI self-start backend with optimized args for !VRAM_PROFILE! profile
>> "!_SWARM_BK!" echo 0:
>> "!_SWARM_BK!" echo     type: comfyui_selfstart
>> "!_SWARM_BK!" echo     title: ComfyUI Self-Starting
>> "!_SWARM_BK!" echo     enabled: true
>> "!_SWARM_BK!" echo     settings:
>> "!_SWARM_BK!" echo         StartScript: dlbackend/comfyui/ComfyUI/main.py
>> "!_SWARM_BK!" echo         ExtraArgs: !_BK_ARGS!
>> "!_SWARM_BK!" echo         DisableInternalArgs:
>> "!_SWARM_BK!" echo         AutoUpdate: true
>> "!_SWARM_BK!" echo         EnvironmentVariables:
>> "!_SWARM_BK!" echo         GPUIDs: 0

echo  [OK] SwarmUI backend configured: !_BK_ARGS!
goto :eof

:ssm_bk_exists
echo  [OK] SwarmUI backends already configured
:: Check if ExtraArgs is empty and suggest optimization
findstr /i "ExtraArgs:" "!_SWARM_BK!" >nul 2>&1
if !errorlevel! neq 0 goto :ssm_bk_hint
findstr /i "ExtraArgs: --" "!_SWARM_BK!" >nul 2>&1
if !errorlevel! equ 0 goto :eof
:ssm_bk_hint
echo       [TIP] To optimize, set ComfyUI backend ExtraArgs in SwarmUI web UI:
echo             Server -^> Backends -^> Edit -^> Extra Args:
echo             --gpu-only --cuda-malloc --fast --reserve-vram 0.5
goto :eof

:: ############################################################
:: #   KOHYA SS / SD-SCRIPTS                                  #
:: ############################################################
:phase_kohya
echo.
echo  =============================================================
echo   KOHYA SS / SD-SCRIPTS
echo  =============================================================
echo  KOHYA >> "!LOG!"
echo.

if exist "!KOHYA_DIR!\sdxl_train_network.py" goto :kohya_update
if exist "!KOHYA_DIR!\sd-scripts\sdxl_train_network.py" goto :kohya_update

:: --- FRESH INSTALL ---
echo  [INSTALL] Kohya ss / sd-scripts...
echo.
if exist "!KOHYA_DIR!\*" rmdir /s /q "!KOHYA_DIR!" 2>nul
call git clone https://github.com/kohya-ss/sd-scripts.git "!KOHYA_DIR!" --depth 1 --recursive
if !errorlevel! neq 0 goto :kohya_clone_fail

echo  [INSTALL] Kohya requirements...
pushd "!KOHYA_DIR!"
call !PY_CMD! -m pip install -r requirements.txt --quiet 2>nul
popd

:: Kohya-specific packages
call !PY_CMD! -m pip install --upgrade lion-pytorch prodigyopt dadaptation lycoris-lora --quiet 2>nul

call :create_kohya_launcher
call :create_kohya_configs

set "HAS_KOHYA=1"
echo  [OK] Kohya ss installed!
goto :eof

:kohya_clone_fail
echo  [ERROR] Git clone failed!
goto :eof

:kohya_update
echo  [UPDATE] Kohya ss...
pushd "!KOHYA_DIR!"
call :smart_pull
if "!_PULL_CHANGED!"=="1" if exist "requirements.txt" call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet 2>nul
if "!_PULL_CHANGED!"=="0" echo  [SKIP] Already up to date - pip install skipped
popd
echo  [OK] Kohya ss updated
call :create_kohya_launcher
call :create_kohya_configs
goto :eof

:update_kohya
if "!HAS_KOHYA!"=="0" goto :eof
echo  [UPDATE] Kohya ss...
pushd "!KOHYA_DIR!"
call git pull --quiet 2>nul
popd
echo  [OK] Kohya ss
goto :eof

:create_kohya_launcher
> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo @echo off
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo setlocal enabledelayedexpansion
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo title Kohya ss / sd-scripts - RTX 5090
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo color 0D
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo cd /d "!KOHYA_DIR!"
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo :menu
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo cls
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  ========================================
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo   Kohya ss / sd-scripts - RTX 5090
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  ========================================
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [1] Open training shell (cmd prompt here)
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [2] Update + open training shell
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [3] Update only
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [4] Show available training scripts
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [Q] Quit
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo set /p C="  Choice: "
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo if /i "%%C%%"=="1" goto :do_open
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo if /i "%%C%%"=="2" goto :do_update_open
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo if /i "%%C%%"=="3" goto :do_update
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo if /i "%%C%%"=="4" goto :do_list
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo if /i "%%C%%"=="Q" exit /b
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo goto :menu
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo :do_update_open
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [UPDATE] Pulling latest...
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo call git pull
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [OK] Updated
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo :do_open
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  -------------------------------------------------------
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo   TRAINING SHELL - sd-scripts
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  -------------------------------------------------------
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  Available training scripts:
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo for %%%%f in (*_train_network.py *_train.py train_network.py) do if exist "%%%%f" echo    !PY_CMD! %%%%f --config_file your_config.toml
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  Usage: pick a script above, point it at your .toml config.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  Configs: see example .toml files in this folder or docs.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  Output goes to the folder set in your .toml config.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo cmd /k
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo goto :menu
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo :do_update
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [UPDATE] Pulling latest...
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo call git pull
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  [OK] Updated. Press any key...
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo pause >nul
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo goto :menu
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo :do_list
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  Available training scripts in this folder:
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  -------------------------------------------------------
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo for %%%%f in (*_train_network.py *_train.py train_network.py) do if exist "%%%%f" echo    %%%%f
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  -------------------------------------------------------
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  When kohya-ss adds new model support (FLUX.2, etc),
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo  new scripts appear here automatically after update.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo echo.
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo pause
>> "!KOHYA_DIR!\LAUNCH_Kohya.bat" echo goto :menu

echo  [OK] LAUNCH_Kohya.bat created
goto :eof

:: --- Kohya sample training configs ---
:create_kohya_configs
set "KC_DIR=!KOHYA_DIR!\configs"
if not exist "!KC_DIR!" mkdir "!KC_DIR!"

:: Only create if not already present (don't overwrite user edits)
if exist "!KC_DIR!\sdxl_lora_example.toml" goto :kc_skip_sdxl

echo  [CREATE] Sample config: sdxl_lora_example.toml
> "!KC_DIR!\sdxl_lora_example.toml" echo # SDXL LoRA Training Config - RTX 5090
>> "!KC_DIR!\sdxl_lora_example.toml" echo # Generated by RTX5090_FULL_SETUP.bat
>> "!KC_DIR!\sdxl_lora_example.toml" echo # Edit paths below, then run:
>> "!KC_DIR!\sdxl_lora_example.toml" echo #   !PY_CMD! sdxl_train_network.py --config_file configs/sdxl_lora_example.toml
>> "!KC_DIR!\sdxl_lora_example.toml" echo.
>> "!KC_DIR!\sdxl_lora_example.toml" echo [model_arguments]
>> "!KC_DIR!\sdxl_lora_example.toml" echo pretrained_model_name_or_path = "!MODELS_DIR:\=/!/checkpoints/sd_xl_base_1.0.safetensors"
>> "!KC_DIR!\sdxl_lora_example.toml" echo.
>> "!KC_DIR!\sdxl_lora_example.toml" echo [additional_network_arguments]
>> "!KC_DIR!\sdxl_lora_example.toml" echo network_module = "networks.lora"
>> "!KC_DIR!\sdxl_lora_example.toml" echo network_dim = 32
>> "!KC_DIR!\sdxl_lora_example.toml" echo network_alpha = 16
>> "!KC_DIR!\sdxl_lora_example.toml" echo.
>> "!KC_DIR!\sdxl_lora_example.toml" echo [optimizer_arguments]
>> "!KC_DIR!\sdxl_lora_example.toml" echo optimizer_type = "AdamW8bit"
>> "!KC_DIR!\sdxl_lora_example.toml" echo learning_rate = 1e-4
>> "!KC_DIR!\sdxl_lora_example.toml" echo lr_scheduler = "cosine_with_restarts"
>> "!KC_DIR!\sdxl_lora_example.toml" echo lr_warmup_steps = 100
>> "!KC_DIR!\sdxl_lora_example.toml" echo.
>> "!KC_DIR!\sdxl_lora_example.toml" echo [dataset_arguments]
>> "!KC_DIR!\sdxl_lora_example.toml" echo resolution = [1024, 1024]
>> "!KC_DIR!\sdxl_lora_example.toml" echo enable_bucket = true
>> "!KC_DIR!\sdxl_lora_example.toml" echo min_bucket_reso = 512
>> "!KC_DIR!\sdxl_lora_example.toml" echo max_bucket_reso = 2048
>> "!KC_DIR!\sdxl_lora_example.toml" echo.
>> "!KC_DIR!\sdxl_lora_example.toml" echo [[dataset_arguments.subsets]]
>> "!KC_DIR!\sdxl_lora_example.toml" echo # EDIT THIS: path to your training images
>> "!KC_DIR!\sdxl_lora_example.toml" echo image_dir = "C:/_AI/training_data/my_concept"
>> "!KC_DIR!\sdxl_lora_example.toml" echo num_repeats = 10
>> "!KC_DIR!\sdxl_lora_example.toml" echo caption_extension = ".txt"
>> "!KC_DIR!\sdxl_lora_example.toml" echo.
>> "!KC_DIR!\sdxl_lora_example.toml" echo [training_arguments]
>> "!KC_DIR!\sdxl_lora_example.toml" echo output_dir = "!KOHYA_DIR:\=/!/output"
>> "!KC_DIR!\sdxl_lora_example.toml" echo output_name = "my_sdxl_lora"
>> "!KC_DIR!\sdxl_lora_example.toml" echo save_precision = "fp16"
>> "!KC_DIR!\sdxl_lora_example.toml" echo save_every_n_epochs = 1
>> "!KC_DIR!\sdxl_lora_example.toml" echo train_batch_size = 1
>> "!KC_DIR!\sdxl_lora_example.toml" echo max_train_epochs = 10
>> "!KC_DIR!\sdxl_lora_example.toml" echo mixed_precision = "bf16"
>> "!KC_DIR!\sdxl_lora_example.toml" echo cache_latents = true
>> "!KC_DIR!\sdxl_lora_example.toml" echo cache_latents_to_disk = true
>> "!KC_DIR!\sdxl_lora_example.toml" echo gradient_checkpointing = true
>> "!KC_DIR!\sdxl_lora_example.toml" echo xformers = true
>> "!KC_DIR!\sdxl_lora_example.toml" echo seed = 42

:kc_skip_sdxl
if exist "!KC_DIR!\flux_lora_example.toml" goto :kc_skip_flux

echo  [CREATE] Sample config: flux_lora_example.toml
> "!KC_DIR!\flux_lora_example.toml" echo # FLUX.1 LoRA Training Config - RTX 5090
>> "!KC_DIR!\flux_lora_example.toml" echo # Generated by RTX5090_FULL_SETUP.bat
>> "!KC_DIR!\flux_lora_example.toml" echo # Edit paths below, then run:
>> "!KC_DIR!\flux_lora_example.toml" echo #   !PY_CMD! flux_train_network.py --config_file configs/flux_lora_example.toml
>> "!KC_DIR!\flux_lora_example.toml" echo.
>> "!KC_DIR!\flux_lora_example.toml" echo [model_arguments]
>> "!KC_DIR!\flux_lora_example.toml" echo pretrained_model_name_or_path = "!MODELS_DIR:\=/!/unet/flux1-dev.safetensors"
>> "!KC_DIR!\flux_lora_example.toml" echo clip_l = "!MODELS_DIR:\=/!/clip/clip_l.safetensors"
>> "!KC_DIR!\flux_lora_example.toml" echo t5xxl = "!MODELS_DIR:\=/!/clip/t5xxl_fp16.safetensors"
>> "!KC_DIR!\flux_lora_example.toml" echo ae = "!MODELS_DIR:\=/!/vae/ae.safetensors"
>> "!KC_DIR!\flux_lora_example.toml" echo.
>> "!KC_DIR!\flux_lora_example.toml" echo [additional_network_arguments]
>> "!KC_DIR!\flux_lora_example.toml" echo network_module = "networks.lora_flux"
>> "!KC_DIR!\flux_lora_example.toml" echo network_dim = 16
>> "!KC_DIR!\flux_lora_example.toml" echo network_alpha = 8
>> "!KC_DIR!\flux_lora_example.toml" echo.
>> "!KC_DIR!\flux_lora_example.toml" echo [optimizer_arguments]
>> "!KC_DIR!\flux_lora_example.toml" echo optimizer_type = "AdamW8bit"
>> "!KC_DIR!\flux_lora_example.toml" echo learning_rate = 5e-5
>> "!KC_DIR!\flux_lora_example.toml" echo lr_scheduler = "constant_with_warmup"
>> "!KC_DIR!\flux_lora_example.toml" echo lr_warmup_steps = 100
>> "!KC_DIR!\flux_lora_example.toml" echo.
>> "!KC_DIR!\flux_lora_example.toml" echo [dataset_arguments]
>> "!KC_DIR!\flux_lora_example.toml" echo resolution = [1024, 1024]
>> "!KC_DIR!\flux_lora_example.toml" echo enable_bucket = true
>> "!KC_DIR!\flux_lora_example.toml" echo min_bucket_reso = 512
>> "!KC_DIR!\flux_lora_example.toml" echo max_bucket_reso = 2048
>> "!KC_DIR!\flux_lora_example.toml" echo.
>> "!KC_DIR!\flux_lora_example.toml" echo [[dataset_arguments.subsets]]
>> "!KC_DIR!\flux_lora_example.toml" echo # EDIT THIS: path to your training images
>> "!KC_DIR!\flux_lora_example.toml" echo image_dir = "C:/_AI/training_data/my_concept"
>> "!KC_DIR!\flux_lora_example.toml" echo num_repeats = 10
>> "!KC_DIR!\flux_lora_example.toml" echo caption_extension = ".txt"
>> "!KC_DIR!\flux_lora_example.toml" echo.
>> "!KC_DIR!\flux_lora_example.toml" echo [training_arguments]
>> "!KC_DIR!\flux_lora_example.toml" echo output_dir = "!KOHYA_DIR:\=/!/output"
>> "!KC_DIR!\flux_lora_example.toml" echo output_name = "my_flux_lora"
>> "!KC_DIR!\flux_lora_example.toml" echo save_precision = "bf16"
>> "!KC_DIR!\flux_lora_example.toml" echo save_every_n_epochs = 1
>> "!KC_DIR!\flux_lora_example.toml" echo train_batch_size = 1
>> "!KC_DIR!\flux_lora_example.toml" echo max_train_steps = 1500
>> "!KC_DIR!\flux_lora_example.toml" echo mixed_precision = "bf16"
>> "!KC_DIR!\flux_lora_example.toml" echo cache_latents = true
>> "!KC_DIR!\flux_lora_example.toml" echo cache_latents_to_disk = true
>> "!KC_DIR!\flux_lora_example.toml" echo cache_text_encoder_outputs = true
>> "!KC_DIR!\flux_lora_example.toml" echo cache_text_encoder_outputs_to_disk = true
>> "!KC_DIR!\flux_lora_example.toml" echo gradient_checkpointing = true
>> "!KC_DIR!\flux_lora_example.toml" echo # RTX 5090: fp8 base model saves massive VRAM
>> "!KC_DIR!\flux_lora_example.toml" echo fp8_base = true
>> "!KC_DIR!\flux_lora_example.toml" echo seed = 42

:kc_skip_flux
echo  [OK] Sample configs in !KC_DIR!
goto :eof

:: ############################################################
:: #   MUSUBI TUNER                                           #
:: ############################################################
:phase_musubi
echo.
echo  =============================================================
echo   MUSUBI TUNER
echo  =============================================================
echo  MUSUBI >> "!LOG!"
echo.

if exist "!MUSUBI_DIR!\.git" goto :musubi_update

:: --- FRESH INSTALL ---
echo  [INSTALL] Musubi Tuner...
echo.
:: If dir exists but is incomplete, remove it first
if exist "!MUSUBI_DIR!\*" rmdir /s /q "!MUSUBI_DIR!" 2>nul
call git clone https://github.com/kohya-ss/musubi-tuner.git "!MUSUBI_DIR!" --depth 1
if !errorlevel! neq 0 goto :musubi_clone_fail

echo  [INSTALL] Musubi requirements...
pushd "!MUSUBI_DIR!"
if exist "requirements.txt" call !PY_CMD! -m pip install -r requirements.txt --quiet 2>nul
popd

call :create_musubi_launcher
call :create_musubi_configs

set "HAS_MUSUBI=1"
echo  [OK] Musubi Tuner installed!
goto :eof

:musubi_clone_fail
echo  [ERROR] Git clone failed!
goto :eof

:musubi_update
echo  [UPDATE] Musubi Tuner...
pushd "!MUSUBI_DIR!"
call :smart_pull
if "!_PULL_CHANGED!"=="1" if exist "requirements.txt" call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet 2>nul
if "!_PULL_CHANGED!"=="0" echo  [SKIP] Already up to date - pip install skipped
popd
echo  [OK] Musubi Tuner updated
call :create_musubi_launcher
call :create_musubi_configs
goto :eof

:update_musubi
if "!HAS_MUSUBI!"=="0" goto :eof
echo  [UPDATE] Musubi Tuner...
pushd "!MUSUBI_DIR!"
call git pull --quiet 2>nul
popd
echo  [OK] Musubi Tuner
goto :eof

:create_musubi_launcher
> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo @echo off
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo setlocal enabledelayedexpansion
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo title Musubi Tuner - Video Training - RTX 5090
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo color 0B
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo cd /d "!MUSUBI_DIR!"
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo :menu
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo cls
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  ========================================
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo   Musubi Tuner - Video Training
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo   RTX 5090 Optimized
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  ========================================
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [1] Open training shell (cmd prompt here)
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [2] Update + open training shell
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [3] Update only
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [4] Show available training scripts
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [Q] Quit
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo set /p C="  Choice: "
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo if /i "%%C%%"=="1" goto :do_open
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo if /i "%%C%%"=="2" goto :do_update_open
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo if /i "%%C%%"=="3" goto :do_update
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo if /i "%%C%%"=="4" goto :do_list
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo if /i "%%C%%"=="Q" exit /b
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo goto :menu
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo :do_update_open
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [UPDATE] Pulling latest...
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo call git pull
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [OK] Updated
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo :do_open
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  -------------------------------------------------------
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo   TRAINING SHELL - Musubi Tuner (video models)
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  -------------------------------------------------------
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  Available training scripts:
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo for %%%%f in (*_train_network.py *_train.py train_network.py) do if exist "%%%%f" echo    !PY_CMD! %%%%f --config_file your_config.toml
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  Workflow:
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo    1. Prepare your training data (videos/images)
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo    2. Create/edit a .toml config file
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo    3. Run the appropriate train script with --config_file
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo    4. Output LoRA goes to the folder set in your .toml
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  See README.md and docs/ in this folder for config examples.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo cmd /k
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo goto :menu
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo :do_update
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [UPDATE] Pulling latest...
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo call git pull
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo call !PY_CMD! -m pip install -r requirements.txt --upgrade --quiet
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  [OK] Updated. Press any key...
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo pause >nul
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo goto :menu
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo :do_list
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  Available training scripts in this folder:
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  -------------------------------------------------------
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo for %%%%f in (*_train_network.py *_train.py train_network.py) do if exist "%%%%f" echo    %%%%f
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  -------------------------------------------------------
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  Supported models: HunyuanVideo, Wan2.1, FramePack, etc.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo  New model support appears automatically after update.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo echo.
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo pause
>> "!MUSUBI_DIR!\LAUNCH_Musubi.bat" echo goto :menu

echo  [OK] LAUNCH_Musubi.bat created
goto :eof

:: --- Musubi sample training configs ---
:create_musubi_configs
set "MC_DIR=!MUSUBI_DIR!\configs"
if not exist "!MC_DIR!" mkdir "!MC_DIR!"

:: HunyuanVideo LoRA example
if exist "!MC_DIR!\hunyuan_video_lora_example.toml" goto :mc_skip_hunyuan

echo  [CREATE] Sample config: hunyuan_video_lora_example.toml
> "!MC_DIR!\hunyuan_video_lora_example.toml" echo # HunyuanVideo LoRA Training Config - RTX 5090
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo # Generated by RTX5090_FULL_SETUP.bat
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo # Edit paths below, then run:
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo #   !PY_CMD! hv_train_network.py --config_file configs/hunyuan_video_lora_example.toml
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo.
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo [model_arguments]
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo dit = "!MODELS_DIR:\=/!/diffusion_models/hunyuan_video.safetensors"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo vae = "!MODELS_DIR:\=/!/vae/hunyuan_video_vae.safetensors"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo text_encoder1 = "!MODELS_DIR:\=/!/clip/clip_l.safetensors"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo text_encoder2 = "!MODELS_DIR:\=/!/clip/llava_llama3_fp16.safetensors"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo.
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo [additional_network_arguments]
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo network_module = "networks.lora"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo network_dim = 32
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo network_alpha = 16
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo.
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo [optimizer_arguments]
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo optimizer_type = "AdamW8bit"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo learning_rate = 2e-4
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo lr_scheduler = "constant_with_warmup"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo lr_warmup_steps = 50
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo.
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo [dataset_arguments]
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo # Video resolution and frame count
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo resolution = [512, 512]
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo enable_bucket = true
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo.
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo [[dataset_arguments.subsets]]
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo # EDIT THIS: path to your training videos
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo video_dir = "C:/_AI/training_data/my_videos"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo num_repeats = 1
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo caption_extension = ".txt"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo # Target frame count (adjust for VRAM)
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo target_frames = 17
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo.
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo [training_arguments]
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo output_dir = "!MUSUBI_DIR:\=/!/output"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo output_name = "my_hv_lora"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo save_precision = "bf16"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo save_every_n_steps = 100
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo train_batch_size = 1
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo max_train_steps = 500
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo mixed_precision = "bf16"
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo gradient_checkpointing = true
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo # RTX 5090: fp8 base model saves massive VRAM for video
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo fp8_base = true
>> "!MC_DIR!\hunyuan_video_lora_example.toml" echo seed = 42

:mc_skip_hunyuan
:: Wan2.1 LoRA example
if exist "!MC_DIR!\wan21_lora_example.toml" goto :mc_skip_wan

echo  [CREATE] Sample config: wan21_lora_example.toml
> "!MC_DIR!\wan21_lora_example.toml" echo # Wan2.1 LoRA Training Config - RTX 5090
>> "!MC_DIR!\wan21_lora_example.toml" echo # Generated by RTX5090_FULL_SETUP.bat
>> "!MC_DIR!\wan21_lora_example.toml" echo # Edit paths below, then run:
>> "!MC_DIR!\wan21_lora_example.toml" echo #   !PY_CMD! wan_train_network.py --config_file configs/wan21_lora_example.toml
>> "!MC_DIR!\wan21_lora_example.toml" echo.
>> "!MC_DIR!\wan21_lora_example.toml" echo [model_arguments]
>> "!MC_DIR!\wan21_lora_example.toml" echo dit = "!MODELS_DIR:\=/!/diffusion_models/wan2.1_t2v_1.3B_bf16.safetensors"
>> "!MC_DIR!\wan21_lora_example.toml" echo vae = "!MODELS_DIR:\=/!/vae/wan2.1_vae.safetensors"
>> "!MC_DIR!\wan21_lora_example.toml" echo t5xxl = "!MODELS_DIR:\=/!/clip/t5xxl_fp16.safetensors"
>> "!MC_DIR!\wan21_lora_example.toml" echo.
>> "!MC_DIR!\wan21_lora_example.toml" echo [additional_network_arguments]
>> "!MC_DIR!\wan21_lora_example.toml" echo network_module = "networks.lora"
>> "!MC_DIR!\wan21_lora_example.toml" echo network_dim = 32
>> "!MC_DIR!\wan21_lora_example.toml" echo network_alpha = 16
>> "!MC_DIR!\wan21_lora_example.toml" echo.
>> "!MC_DIR!\wan21_lora_example.toml" echo [optimizer_arguments]
>> "!MC_DIR!\wan21_lora_example.toml" echo optimizer_type = "AdamW8bit"
>> "!MC_DIR!\wan21_lora_example.toml" echo learning_rate = 2e-4
>> "!MC_DIR!\wan21_lora_example.toml" echo lr_scheduler = "constant_with_warmup"
>> "!MC_DIR!\wan21_lora_example.toml" echo lr_warmup_steps = 50
>> "!MC_DIR!\wan21_lora_example.toml" echo.
>> "!MC_DIR!\wan21_lora_example.toml" echo [dataset_arguments]
>> "!MC_DIR!\wan21_lora_example.toml" echo resolution = [480, 832]
>> "!MC_DIR!\wan21_lora_example.toml" echo enable_bucket = true
>> "!MC_DIR!\wan21_lora_example.toml" echo.
>> "!MC_DIR!\wan21_lora_example.toml" echo [[dataset_arguments.subsets]]
>> "!MC_DIR!\wan21_lora_example.toml" echo # EDIT THIS: path to your training videos
>> "!MC_DIR!\wan21_lora_example.toml" echo video_dir = "C:/_AI/training_data/my_videos"
>> "!MC_DIR!\wan21_lora_example.toml" echo num_repeats = 1
>> "!MC_DIR!\wan21_lora_example.toml" echo caption_extension = ".txt"
>> "!MC_DIR!\wan21_lora_example.toml" echo target_frames = 17
>> "!MC_DIR!\wan21_lora_example.toml" echo.
>> "!MC_DIR!\wan21_lora_example.toml" echo [training_arguments]
>> "!MC_DIR!\wan21_lora_example.toml" echo output_dir = "!MUSUBI_DIR:\=/!/output"
>> "!MC_DIR!\wan21_lora_example.toml" echo output_name = "my_wan21_lora"
>> "!MC_DIR!\wan21_lora_example.toml" echo save_precision = "bf16"
>> "!MC_DIR!\wan21_lora_example.toml" echo save_every_n_steps = 100
>> "!MC_DIR!\wan21_lora_example.toml" echo train_batch_size = 1
>> "!MC_DIR!\wan21_lora_example.toml" echo max_train_steps = 500
>> "!MC_DIR!\wan21_lora_example.toml" echo mixed_precision = "bf16"
>> "!MC_DIR!\wan21_lora_example.toml" echo gradient_checkpointing = true
>> "!MC_DIR!\wan21_lora_example.toml" echo fp8_base = true
>> "!MC_DIR!\wan21_lora_example.toml" echo seed = 42

:mc_skip_wan
echo  [OK] Sample configs in !MC_DIR!
goto :eof

:: ############################################################
:: #   CLEANUP                                                #
:: ############################################################
:phase_cleanup
echo.
echo  =============================================================
echo   CLEANUP
echo  =============================================================
echo  CLEANUP >> "!LOG!"
echo.

:: pip cache
echo  [CLEAN] pip cache...
call !PY_CMD! -m pip cache purge --quiet 2>nul
echo  [OK] pip cache cleared

:: __pycache__
set "CLEAN_COUNT=0"
echo  [CLEAN] __pycache__ in !BASE_DIR!...
for /f "tokens=*" %%d in ('dir /b /s /ad "!BASE_DIR!\__pycache__" 2^>nul') do call :clean_one_cache "%%d"
echo  [OK] Removed !CLEAN_COUNT! __pycache__ dirs

:: Temp files
echo  [CLEAN] Temp files...
del "%TEMP%\rtx5090_*" >nul 2>&1
del "%TEMP%\drvver*" >nul 2>&1
for /d %%d in ("%TEMP%\pip-*") do rd /s /q "%%d" 2>nul
echo  [OK] Temp cleaned

:: .pyc files in base dir
echo  [CLEAN] Stale .pyc files...
set "PYC_COUNT=0"
for /r "!BASE_DIR!" %%f in (*.pyc) do call :clean_one_pyc "%%f"
echo  [OK] Removed !PYC_COUNT! .pyc files

echo.
echo  [INFO] To reclaim more space:
echo         - Delete unused models from !MODELS_DIR!
echo         - pip cache purge
echo.
goto :eof

:clean_one_cache
rd /s /q "%~1" 2>nul
set /a CLEAN_COUNT+=1
goto :eof

:clean_one_pyc
del "%~1" 2>nul
set /a PYC_COUNT+=1
goto :eof

:: ############################################################
:: #   DIAGNOSTICS                                            #
:: ############################################################
:phase_diagnostics
echo.
echo  =============================================================
echo   DIAGNOSTICS
echo  =============================================================
echo.

:: GPU
echo  [GPU]
nvidia-smi -L 2>nul
nvidia-smi 2>nul | findstr /i "MiB"
echo.

:: Python diag
set "DIAG_PY=%TEMP%\rtx5090_diag.py"
> "!DIAG_PY!" echo import sys
>> "!DIAG_PY!" echo print("  Python:     ", sys.version.split()[0])
>> "!DIAG_PY!" echo print("  Executable: ", sys.executable)
>> "!DIAG_PY!" echo try:
>> "!DIAG_PY!" echo     import torch
>> "!DIAG_PY!" echo     print("  PyTorch:    ", torch.__version__)
>> "!DIAG_PY!" echo     print("  CUDA torch: ", torch.version.cuda)
>> "!DIAG_PY!" echo     try:
>> "!DIAG_PY!" echo         cv = torch.backends.cudnn.version()
>> "!DIAG_PY!" echo         print("  cuDNN:      ", cv)
>> "!DIAG_PY!" echo     except Exception:
>> "!DIAG_PY!" echo         print("  cuDNN:       N/A")
>> "!DIAG_PY!" echo     ga = torch.cuda.is_available()
>> "!DIAG_PY!" echo     print("  GPU visible:", ga)
>> "!DIAG_PY!" echo     if ga:
>> "!DIAG_PY!" echo         print("  GPU name:   ", torch.cuda.get_device_name(0))
>> "!DIAG_PY!" echo         p = torch.cuda.get_device_properties(0)
>> "!DIAG_PY!" echo         mem = getattr(p, 'total_memory', None) or getattr(p, 'total_mem', 0)
>> "!DIAG_PY!" echo         print("  VRAM:        {:.1f} GB".format(mem / 1073741824))
>> "!DIAG_PY!" echo         cap = torch.cuda.get_device_capability(0)
>> "!DIAG_PY!" echo         print("  Compute:     SM_{}.{}".format(cap[0], cap[1]))
>> "!DIAG_PY!" echo         print("  TF32:       ", torch.backends.cuda.matmul.allow_tf32)
>> "!DIAG_PY!" echo         print("  BF16:       ", torch.cuda.is_bf16_supported())
>> "!DIAG_PY!" echo except ImportError:
>> "!DIAG_PY!" echo     print("  PyTorch:     NOT INSTALLED")
>> "!DIAG_PY!" echo except Exception as e:
>> "!DIAG_PY!" echo     print("  Error:       ", e)
>> "!DIAG_PY!" echo try:
>> "!DIAG_PY!" echo     import xformers; print("  xformers:   ", xformers.__version__)
>> "!DIAG_PY!" echo except: print("  xformers:    N/A")
>> "!DIAG_PY!" echo try:
>> "!DIAG_PY!" echo     import sageattention; print("  SageAttn:    OK")
>> "!DIAG_PY!" echo except: print("  SageAttn:    N/A")
>> "!DIAG_PY!" echo try:
>> "!DIAG_PY!" echo     import bitsandbytes; print("  BnB:        ", bitsandbytes.__version__)
>> "!DIAG_PY!" echo except: print("  BnB:         N/A")

call !PY_CMD! "!DIAG_PY!" 2>nul
call !PY_CMD! "!DIAG_PY!" >> "!LOG!" 2>nul
del "!DIAG_PY!" >nul 2>&1
echo.

echo  [CUDA Toolkit]
nvcc --version 2>nul | findstr /i "release"
echo.

echo  [.NET SDK]
dotnet --list-sdks 2>nul | findstr "!DOTNET_MAJOR!."
echo.

echo  [Python Versions]
where py >nul 2>&1
if !errorlevel! equ 0 goto :diag_py_list
echo   launcher unavailable
goto :diag_py_active
:diag_py_list
py --list 2>nul
:diag_py_active
echo   Active: !PY_CMD! = !PY_VER!
echo.

:: --- Installed apps ---
echo  -------------------------------------------------------
echo   INSTALLED APPS
echo  -------------------------------------------------------
echo.

call :diag_show_app ComfyUI "!COMFYUI_DIR!" "!COMFYUI_DIR!\main.py"
call :diag_show_app SwarmUI "!SWARMUI_DIR!" "!SWARMUI_DIR!\launchtools"
call :diag_show_app "Kohya ss" "!KOHYA_DIR!" "!KOHYA_DIR!\sdxl_train_network.py"
call :diag_show_app "Musubi Tuner" "!MUSUBI_DIR!" "!MUSUBI_DIR!\.git"

echo.

if not exist "!MODELS_DIR!" goto :diag_no_models
echo   Models folder: !MODELS_DIR!
:: Count models
set "MDL_CT=0"
for /r "!MODELS_DIR!" %%f in (*.safetensors *.ckpt *.pt *.bin *.gguf) do set /a MDL_CT+=1
echo   Model files: !MDL_CT!
goto :diag_checklist

:diag_no_models
echo   Models folder: not created yet

:diag_checklist
echo.

:: --- System checklist ---
echo  -------------------------------------------------------
echo   SYSTEM CHECKLIST
echo  -------------------------------------------------------
echo.

call :diag_check_git
call :diag_check_py
call :diag_check_dotnet
call :diag_check_nvidia
call :diag_check_nvcc
call :diag_check_torch
call :diag_check_xformers
call :diag_check_ffmpeg
call :diag_check_vscode

echo.
goto :eof

:: --- Diagnostics helpers ---
:diag_show_app
set "DSA_NAME=%~1"
set "DSA_DIR=%~2"
set "DSA_CHECK=%~3"
if not exist "!DSA_CHECK!" goto :dsa_not_installed
echo   [X] !DSA_NAME! ......... !DSA_DIR!
goto :eof
:dsa_not_installed
echo   [ ] !DSA_NAME! ......... not installed
goto :eof

:diag_check_git
where git >nul 2>&1
if !errorlevel! equ 0 goto :dcgit_ok
echo   [ ] Git
goto :eof
:dcgit_ok
echo   [X] Git
goto :eof

:diag_check_py
call !PY_CMD! --version >nul 2>&1
if !errorlevel! equ 0 goto :dcp_ok
echo   [ ] Python
goto :eof
:dcp_ok
echo   [X] Python !PY_VER!
goto :eof

:diag_check_dotnet
where dotnet >nul 2>&1
if !errorlevel! equ 0 goto :dcdn_ok
echo   [ ] .NET SDK
goto :eof
:dcdn_ok
echo   [X] .NET !DOTNET_MAJOR! SDK
goto :eof

:diag_check_nvidia
where nvidia-smi >nul 2>&1
if !errorlevel! equ 0 goto :dcnv_ok
echo   [ ] NVIDIA Driver
goto :eof
:dcnv_ok
echo   [X] NVIDIA Driver
goto :eof

:diag_check_nvcc
where nvcc >nul 2>&1
if !errorlevel! equ 0 goto :dcnvcc_ok
echo   [ ] CUDA Toolkit
goto :eof
:dcnvcc_ok
echo   [X] CUDA Toolkit
goto :eof

:diag_check_torch
call !PY_CMD! -c "import torch; exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
if !errorlevel! equ 0 goto :dct_ok
echo   [ ] PyTorch CUDA
goto :eof
:dct_ok
echo   [X] PyTorch CUDA
goto :eof

:diag_check_xformers
call !PY_CMD! -c "import xformers" >nul 2>&1
if !errorlevel! equ 0 goto :dcx_ok
echo   [ ] xformers
goto :eof
:dcx_ok
echo   [X] xformers
goto :eof

:diag_check_ffmpeg
where ffmpeg >nul 2>&1
if !errorlevel! equ 0 goto :dcff_ok
echo   [ ] ffmpeg
goto :eof
:dcff_ok
echo   [X] ffmpeg
goto :eof

:diag_check_vscode
where code >nul 2>&1
if !errorlevel! equ 0 goto :dcvs_ok
echo   [ ] VS Code
goto :eof
:dcvs_ok
echo   [X] VS Code
goto :eof

:: ############################################################
:: #   GIT SMART PULL                                          #
:: ############################################################

:smart_pull
:: Must call from within a pushd directory.
:: Sets _PULL_CHANGED=1 if new commits pulled, 0 if already up to date.
:: Shows git pull output to console.
set "_sp_tmp=%TEMP%\_rtx_git_pull_%RANDOM%.tmp"
call git pull 2>nul > "!_sp_tmp!"
type "!_sp_tmp!"
findstr /i "Already up to date" "!_sp_tmp!" >nul 2>&1
if !errorlevel! equ 0 goto :sp_unchanged
set "_PULL_CHANGED=1"
del "!_sp_tmp!" 2>nul
goto :eof
:sp_unchanged
set "_PULL_CHANGED=0"
del "!_sp_tmp!" 2>nul
goto :eof

:smart_pull_quiet
:: Same as smart_pull but no console output (for tight loops)
set "_sp_tmp=%TEMP%\_rtx_git_pull_%RANDOM%.tmp"
call git pull 2>nul > "!_sp_tmp!"
findstr /i "Already up to date" "!_sp_tmp!" >nul 2>&1
if !errorlevel! equ 0 goto :spq_unchanged
set "_PULL_CHANGED=1"
del "!_sp_tmp!" 2>nul
goto :eof
:spq_unchanged
set "_PULL_CHANGED=0"
del "!_sp_tmp!" 2>nul
goto :eof

:: ############################################################
:: #   PROGRESS BAR + TIMING UTILITIES                        #
:: ############################################################

:make_bar
:: %1=current %2=total -> sets _BAR_LINE
set /a "_sb_pct=%~1 * 100 / %~2"
set /a "_sb_f=%~1 * 20 / %~2"
set /a "_sb_e=20 - !_sb_f!"
for %%F in (!_sb_f!) do for %%E in (!_sb_e!) do set "_sb_bar=!_BARFULL:~0,%%F!!_BARNONE:~0,%%E!"
set "_sb_n=  %~1"
set "_sb_n=!_sb_n:~-3!"
set "_sb_p=  !_sb_pct!"
set "_sb_p=!_sb_p:~-3!"
set "_BAR_LINE=[!_sb_n!/%~2] [!_sb_bar!] !_sb_p!%%"
goto :eof

:get_ts
:: Sets _TS to current time in seconds (handles leading-zero octal issue)
set "_t=!time: =0!"
set /a "_TS=1!_t:~0,2! %% 100 * 3600 + 1!_t:~3,2! %% 100 * 60 + 1!_t:~6,2! %% 100"
goto :eof

:calc_elapsed
:: %1=start_seconds %2=end_seconds -> sets _ELAPSED
set /a "_ce_d=%~2 - %~1"
if !_ce_d! lss 0 set /a "_ce_d+=86400"
set /a "_ce_m=!_ce_d! / 60"
set /a "_ce_s=!_ce_d! %% 60"
if !_ce_s! lss 10 set "_ce_s=0!_ce_s!"
set "_ELAPSED=!_ce_m!m !_ce_s!s"
goto :eof

:show_summary
:: %1=section_name %2=total %3=ok %4=warn %5=elapsed
echo.
echo  +-------------------------------------------------------+
echo  :  %~1 Complete
echo  :  Total: %~2   OK: %~3   Warnings: %~4
echo  :  Time: %~5
echo  +-------------------------------------------------------+
goto :eof

:show_summary_nodes
:: %1=total %2=installed %3=updated %4=warn %5=elapsed
echo.
echo  +-------------------------------------------------------+
echo  :  Custom Nodes Complete
echo  :  Available: %~1   New: %~2   Updated: %~3   Failed: %~4
echo  :  Time: %~5
echo  +-------------------------------------------------------+
goto :eof

:: ############################################################
:: #   END                                                    #
:: ############################################################
:done
echo.
echo  Goodbye!
echo.
endlocal
