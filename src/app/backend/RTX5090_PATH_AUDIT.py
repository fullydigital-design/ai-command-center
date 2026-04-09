"""
RTX 5090 PATH Audit + Cleanup Script
Called by RTX5090_FULL_SETUP.bat [P] PATH Cleanup
Audits System/User PATH, removes stale entries, adds Python 3.12, sets env vars.
"""
import os, sys, stat, shutil, subprocess

PREFERRED = sys.argv[1] if len(sys.argv) > 1 else '3.12'
PREFERRED_TAG = PREFERRED.replace('.', '')  # '312'

# Patterns that should be REMOVED from PATH
STALE = ['Python_31011', 'Python_313', 'Miniconda3_313',
         'CUDA\\v13.1', 'CUDA\\v13.0',
         'CUDA/v13.1', 'CUDA/v13.0']

# Old folders to offer deletion
OLD_FOLDERS = [r'C:\Python_31011', r'C:\Python_313', r'C:\Miniconda3_313']

# CUDA version search order
CUDA_VERSIONS = ['13.0', '12.9', '12.8', '12.6']

def find_cuda():
    for v in CUDA_VERSIONS:
        p = rf'C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v{v}'
        if os.path.exists(os.path.join(p, 'bin', 'nvcc.exe')):
            return p
    return None

def find_python():
    tag = f'Python{PREFERRED_TAG}'
    candidates = [
        os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Python', tag),
        rf'C:\{tag}',
        rf'C:\Program Files\{tag}',
    ]
    for c in candidates:
        if os.path.exists(os.path.join(c, 'python.exe')):
            return c
    return None

def is_stale(entry):
    for pat in STALE:
        if pat.lower() in entry.lower():
            return True
    return False

def get_size_mb(path):
    total = 0
    try:
        for root, dirs, files in os.walk(path):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except:
                    pass
    except:
        pass
    return total / (1024 * 1024)

try:
    import winreg
    CAN_WRITE = True
except ImportError:
    CAN_WRITE = False

def read_path(scope):
    try:
        if scope == 'Machine':
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
                0, winreg.KEY_READ)
        else:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Environment',
                0, winreg.KEY_READ)
        val, _ = winreg.QueryValueEx(key, 'Path')
        winreg.CloseKey(key)
        return [e for e in val.split(';') if e.strip()]
    except:
        return []

def write_path(scope, entries):
    try:
        if scope == 'Machine':
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
                0, winreg.KEY_SET_VALUE)
        else:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Environment',
                0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, 'Path', 0, winreg.REG_EXPAND_SZ, ';'.join(entries))
        winreg.CloseKey(key)
        return True
    except PermissionError:
        print('  [ERROR] No admin rights. Run as Administrator!')
        return False
    except Exception as e:
        print(f'  [ERROR] {e}')
        return False

def set_env(name, value):
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
            r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
            0, winreg.KEY_SET_VALUE)
        if value is None:
            try:
                winreg.DeleteValue(key, name)
            except:
                pass
        else:
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
        winreg.CloseKey(key)
        return True
    except:
        return False

def get_env(name):
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
            r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
            0, winreg.KEY_READ)
        val, _ = winreg.QueryValueEx(key, name)
        winreg.CloseKey(key)
        return val
    except:
        return None

# ========== MAIN ==========
print()
print('  ==============================')
print('   SYSTEM PATH AUDIT')
print('  ==============================')
print()

sys_entries = read_path('Machine')
usr_entries = read_path('User')
stale_found = []
missing_found = []

print('  System PATH:')
for e in sys_entries:
    if is_stale(e):
        print(f'   [STALE]   {e}')
        stale_found.append(('Machine', e))
    elif not os.path.exists(e):
        print(f'   [MISSING] {e}')
        missing_found.append(('Machine', e))
    else:
        print(f'   [OK]      {e}')

print()
print('  User PATH:')
for e in usr_entries:
    if is_stale(e):
        print(f'   [STALE]   {e}')
        stale_found.append(('User', e))
    elif not os.path.exists(e):
        print(f'   [MISSING] {e}')
        missing_found.append(('User', e))
    else:
        print(f'   [OK]      {e}')

# Check Python in PATH
py_path = find_python()
py_in_path = any(PREFERRED_TAG.lower() in e.lower() for e in sys_entries + usr_entries)

print()
print('  ==============================')
print('   SUMMARY')
print('  ==============================')
print()
print(f'  Stale entries:       {len(stale_found)}')
print(f'  Non-existent paths:  {len(missing_found)}')
print(f'  Python {PREFERRED} in PATH: {py_in_path}')
if py_path:
    print(f'  Python {PREFERRED} found at:  {py_path}')

total_issues = len(stale_found) + len(missing_found) + (0 if py_in_path else 1)
if total_issues == 0:
    print('  [OK] PATH is clean! Nothing to fix.')
else:
    print()
    print('  Fix all issues? This will:')
    if stale_found:
        print(f'   - Remove {len(stale_found)} stale PATH entries')
    if missing_found:
        print(f'   - Remove {len(missing_found)} non-existent PATH entries')
    if not py_in_path and py_path:
        print(f'   - Add Python {PREFERRED} to PATH')
    print()
    confirm = input('  Apply fixes? (Y/N): ').strip().upper()
    if confirm == 'Y':
        to_remove = set(e for _, e in stale_found + missing_found)
        new_sys = [e for e in sys_entries if e not in to_remove]
        new_usr = [e for e in usr_entries if e not in to_remove]
        if not py_in_path and py_path:
            new_sys = [py_path, os.path.join(py_path, 'Scripts')] + new_sys
            print(f'  [ADD] {py_path}')
            print(f'  [ADD] {py_path}\\Scripts')
        ok1 = write_path('Machine', new_sys)
        ok2 = write_path('User', new_usr)
        if ok1 and ok2:
            print('  [OK] PATH cleaned!')
            for _, e in stale_found + missing_found:
                print(f'   [REMOVED] {e}')
            print()
            print('  [NOTE] Restart terminal for changes to take effect.')
    else:
        print('  [SKIP] No changes.')

# ========== OLD FOLDERS ==========
print()
print('  ==============================')
print('   OLD FOLDERS')
print('  ==============================')
print()

found_old = []
for f in OLD_FOLDERS:
    if os.path.exists(f):
        sz = get_size_mb(f)
        print(f'   [DELETE?] {f}  ({sz:.0f} MB)')
        found_old.append(f)

if not found_old:
    print('   No old Python/Conda folders found.')
else:
    print()
    dc = input('  Delete old folders? (Y/N): ').strip().upper()
    if dc == 'Y':
        for f in found_old:
            try:
                def _on_rm_error(func, path, exc_info):
                    os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
                    func(path)
                shutil.rmtree(f, onerror=_on_rm_error)
                print(f'   [DELETED] {f}')
            except Exception:
                # Fallback: rmdir /s /q is more aggressive than shutil
                r = subprocess.run(['cmd', '/c', 'rmdir', '/s', '/q', f],
                                   capture_output=True, text=True)
                if not os.path.exists(f):
                    print(f'   [DELETED] {f} (via rmdir)')
                else:
                    print(f'   [ERROR] {f} - still exists after rmdir')
                    print(f'           Try manually: rmdir /s /q "{f}"')

# ========== ENVIRONMENT VARIABLES ==========
print()
print('  ==============================')
print('   ENVIRONMENT VARIABLES')
print('  ==============================')
print()

cuda_path = find_cuda()
required_vars = {
    'CUDA_HOME': cuda_path,
    'CUDA_PATH': cuda_path,
    'CUDA_DEVICE_ORDER': 'PCI_BUS_ID',
    'NVIDIA_TF32_OVERRIDE': '1',
    'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True,garbage_collection_threshold:0.8',
    'TORCH_CUDNN_V8_API_ENABLED': '1',
}
stale_vars = ['CUDA_PATH_V12_9']

needs_env = False
for name, want in required_vars.items():
    current = get_env(name)
    if current == want:
        print(f'   [OK]    {name} = {want}')
    elif current:
        print(f'   [FIX]   {name} = {current} -> {want}')
        needs_env = True
    else:
        print(f'   [SET]   {name} = {want}')
        needs_env = True

for sv in stale_vars:
    val = get_env(sv)
    if val:
        print(f'   [STALE] {sv} = {val}')
        needs_env = True

if needs_env:
    print()
    ec = input('  Apply env var changes? (Y/N): ').strip().upper()
    if ec == 'Y':
        for name, want in required_vars.items():
            if want:
                set_env(name, want)
        for sv in stale_vars:
            set_env(sv, None)
        print('   [OK] Environment variables updated!')
else:
    print('   [OK] All environment variables correct!')

print()
print('  Done.')
