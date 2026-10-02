# Minecraft textures, kept local

MazeForge ships original preview materials. To use authentic Minecraft
textures, open **More → Minecraft textures → Choose client JAR** and select the
Minecraft Java Edition client JAR for the version you play. No extra packages,
terminal commands, account or internet download are required.

The importer reads only the file you select. It extracts block models, texture
images and version metadata in your browser, then stores only the resulting
preview atlas and block catalog on your computer. It never executes the JAR or
copies its game code. No textures, game files or paths are uploaded to a remote
service. The local server does not search your disks for client JARs.

## Finding the client JAR

The official launcher normally stores client JARs under its game folder's
`versions/<version>/` directory. Typical game folders are:

| System | Game folder |
| --- | --- |
| Windows | `%APPDATA%\.minecraft` |
| macOS | `~/Library/Application Support/minecraft` |
| Linux | `~/.minecraft` |

Prism and MultiMC commonly use their shared
`libraries/com/mojang/minecraft/<version>/` directory. Other launchers, portable
installs, Flatpak and custom setups use different locations: open your launcher's
folder settings, then choose the client JAR in the standard file chooser. Any
file location readable by your browser can be selected.

Choose the **client** JAR, not a server, mod, installer or resource-pack archive.
The supported importer expects Java Edition 1.14+ archives with `version.json`
and block model metadata. Legacy Java versions and Bedrock use different formats.
An incompatible archive produces a message without replacing your current textures.

The importer has been verified against installed client JARs for 1.20.1, 1.21,
1.21.1, 1.21.11, 26.1.2 and 26.2. Other modern versions use the same import path,
but have not all been tested.

## Version compatibility

Imported textures change the preview. Imported block IDs and states also determine
what is available in the palette, and exported schematics use the imported game's
Minecraft data version. Blocks missing from the imported catalog are replaced with
available vanilla defaults in your design settings.

Matching texture files alone do not make all Minecraft versions interchangeable.
Use a WorldEdit build that supports your target game version. The app writes Sponge
v2 `.schem` files; legacy `.schematic`, Bedrock and `.litematic` formats are not
supported. See the [WorldEdit clipboard documentation](https://worldedit.enginehub.org/en/latest/usage/clipboard/)
and [Sponge format specification](https://github.com/SpongePowered/Schematic-Specification/blob/master/versions/schematic-2.md).

## Reset and distribution

Choose **Use built-in preview** to remove the imported preview files and return to
the bundled library. Local imports live in `web/local-textures/`; Git ignores the
entire directory, and the release packager excludes it by design.

If you share the app, share its official release ZIP. Do not include local textures,
game JARs, exports or `folders.json`. Importing assets locally does not grant
permission to redistribute them; consult the
[Minecraft usage guidelines](https://www.minecraft.net/en-us/usage-guidelines)
for any other use.
