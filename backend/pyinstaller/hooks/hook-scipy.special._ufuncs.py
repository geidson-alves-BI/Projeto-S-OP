from importlib.util import find_spec

from PyInstaller.utils.hooks import is_module_satisfies

# Keep parity with PyInstaller default hook, but guard optional SciPy extensions
# so hiddenimports include only modules that actually exist in the installed wheel.
hiddenimports = ["scipy.special._ufuncs_cxx"]

if is_module_satisfies("scipy >= 1.13.0") and find_spec("scipy.special._cdflib") is not None:
    hiddenimports += ["scipy.special._cdflib"]

if is_module_satisfies("scipy >= 1.14.0") and find_spec("scipy.special._special_ufuncs") is not None:
    hiddenimports += ["scipy.special._special_ufuncs"]
