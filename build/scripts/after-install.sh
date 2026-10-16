#!/bin/bash

# Padrão do electron-builder (templates/linux/after-install.tpl) + criação da
# pasta do cofre em /var/lib, fora de ~/ para sobreviver à limpeza do usuário.

# ${executable} e ${sanitizedProductName} são placeholders do electron-builder:
# o build os substitui antes de o dpkg rodar este script, então as aspas simples
# são proposital (o shell não deve expandir).
# shellcheck disable=SC2016

if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' ] && [ -e '/usr/bin/${executable}' ] && [ "$(readlink '/usr/bin/${executable}')" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Install apparmor profile. (Ubuntu 24+)
# First check if the version of AppArmor running on the device supports our profile.
# This is in order to keep backwards compatibility with Ubuntu 22.04 which does not support abi/4.0.
# In that case, we just skip installing the profile since the app runs fine without it on 22.04.
#
# Those apparmor_parser flags are akin to performing a dry run of loading a profile.
# https://wiki.debian.org/AppArmor/HowToUse#Dumping_profiles
#
# Unfortunately, at the moment AppArmor doesn't have a good story for backwards compatibility.
# https://askubuntu.com/questions/1517272/writing-a-backwards-compatible-apparmor-profile
if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"

    # Updating the current AppArmor profile is not possible and probably not meaningful in a chroot'ed environment.
    # Use cases are for example environments where images for clients are maintained.
    # There, AppArmor might correctly be installed, but live updating makes no sense.
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      # Extra flags taken from dh_apparmor:
      # > By using '-W -T' we ensure that any abstraction updates are also pulled in.
      # https://wiki.debian.org/AppArmor/Contribute/FirstTimeProfileImport
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi

# ---------- Cofre de dados em /var/lib (fora de ~/) ----------
# Pastas ocultas por padrão: /var/lib/.guardinha/.vault. A raiz é
# root:root 0711 sem listagem (navegar/apagar o topo exige sudo) e o vault
# fica com o usuário instalador (0700) para o app funcionar. Se o instalador
# não for identificado, o próprio app pede sudo no primeiro uso.
VAULT_DIR='/var/lib/.guardinha/.vault'
install -d -m 0711 -o root -g root '/var/lib/.guardinha'
VAULT_OWNER_UID="${SUDO_UID:-${PKEXEC_UID:-}}"
VAULT_OWNER_USER=''
if [ -n "$VAULT_OWNER_UID" ]; then
  VAULT_OWNER_USER="$(getent passwd "$VAULT_OWNER_UID" | cut -d: -f1)"
fi
if [ -n "$VAULT_OWNER_USER" ]; then
  VAULT_OWNER_GROUP="$(id -gn "$VAULT_OWNER_USER")"
  install -d -m 0700 -o "$VAULT_OWNER_USER" -g "$VAULT_OWNER_GROUP" "$VAULT_DIR" || true
else
  install -d -m 0700 "$VAULT_DIR" || true
fi

# ---------- Ação do PolicyKit (diálogo padrão do Mint quando o app pede sudo) ----------
cat > /usr/share/polkit-1/actions/com.guardinha.keypass.policy <<'POLICY_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE policyconfig PUBLIC "-//freedesktop//DTD PolicyKit Policy Configuration 1.0//EN" "http://www.freedesktop.org/standards/PolicyKit/1/policyconfig.dtd">
<policyconfig>
  <vendor>Guardinha</vendor>
  <action id="com.guardinha.keypass.setup-vault">
    <description>Configurar a pasta do cofre Guardinha</description>
    <message>É necessário o administrador para criar a pasta do cofre em /var/lib/.guardinha.</message>
    <defaults>
      <allow_any>auth_admin</allow_any>
      <allow_inactive>auth_admin</allow_inactive>
      <allow_active>auth_admin</allow_active>
    </defaults>
    <annotate key="org.freedesktop.policykit.exec.path">/opt/${sanitizedProductName}/resources/guardinha-setup</annotate>
  </action>
</policyconfig>
POLICY_EOF

# pkexec exige o dono root e sem escrita para o grupo/outros; o build pode
# ter gravado as pastas com 0775; normaliza antes de validar o helper.
install -d -m 0755 -o root -g root '/opt/${sanitizedProductName}' '/opt/${sanitizedProductName}/resources' || true
chown root:root '/opt/${sanitizedProductName}/resources/guardinha-setup' || true
chmod 0755 '/opt/${sanitizedProductName}/resources/guardinha-setup' || true
