# Archivo native condensed cuts

These are static instances of Archivo, not a substitute typeface. Native headline rendering does
not depend on variable-width font support. The source is Google Fonts’
[`ofl/archivo/Archivo[wdth,wght].ttf`](https://github.com/google/fonts/tree/main/ofl/archivo),
downloaded 19 November 2026. The accompanying `OFL-Archivo.txt` applies to both files.

Regenerate from the variable source with FontTools (run from the repository root):

```bash
curl -fL 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf' -o /tmp/archivo-variable.ttf
uv run --with fonttools python - <<'PY'
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
for width, weight, family, style, postscript, name in [
    (66, 800, 'Archivo ExtraCondensed', 'ExtraBold', 'ArchivoExtraCondensed-ExtraBold', 'Archivo-ExtraCondensed-ExtraBold.ttf'),
    (75, 700, 'Archivo Condensed', 'Bold', 'ArchivoCondensed-Bold', 'Archivo-Condensed-Bold.ttf'),
]:
    font = instantiateVariableFont(TTFont('/tmp/archivo-variable.ttf'), {'wdth': width, 'wght': weight}, inplace=True)
    names = {1: family, 2: style, 3: f'1.000;DN;{postscript}', 4: f'{family} {style}', 6: postscript, 16: family, 17: style}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    font.save(f'apps/mobile/assets/fonts/{name}')
PY
```

Expo loads them under `ArchivoExtraCondensedExtraBold` and `ArchivoCondensedBold` in the root layout.

The distinct internal family and PostScript names are required: unrenamed instances retain the
variable source’s SemiBold name, which collides with the regular-width Archivo loaded on iOS.
