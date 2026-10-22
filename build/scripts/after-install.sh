#!/bin/bash

# Padrão do electron-builder (templates/linux/after-install.tpl) + criação da
# pasta do cofre em /var/lib, fora de ~/ para sobreviver à limpeza do usuário.
#
# O dpkg roda este script como postinst configure na instalação e de novo em
# cada atualização, então tudo aqui é idempotente: repetir não duplica link,
# perfil do AppArmor, ação do PolicyKit nem permissão.
#
# ${executable} e ${sanitizedProductName} são placeholders do electron-builder:
# o build os substitui antes de o dpkg rodar este script, então as aspas simples
# são proposital (o shell não deve expandir).
# shellcheck disable=SC2016

BINARY_LINK='/usr/bin/${executable}'
BINARY_TARGET='/opt/${sanitizedProductName}/${executable}'

# ---------- link do executável ----------
if type update-alternatives >/dev/null 2>&1; then
    # Sai da frente só o que é symlink: um arquivo real em /usr/bin/${executable}
    # pertence a outro pacote (ou a uma intervenção manual) e o
    # update-alternatives não o substitui sem --force, bandeira que não se usa
    # em script de mantenedor (ver update-alternatives(1), --install).
    if [ -L "$BINARY_LINK" ] && [ "$(readlink "$BINARY_LINK")" != '/etc/alternatives/${executable}' ]; then
        rm -f "$BINARY_LINK"
    fi
    if ! update-alternatives --install "$BINARY_LINK" '${executable}' "$BINARY_TARGET" 100; then
        # Sem o update-alternatives, o link direto é o único caminho, e ele
        # nunca vai sobre um arquivo real pelo motivo acima.
        if [ ! -e "$BINARY_LINK" ] || [ -L "$BINARY_LINK" ]; then
            ln -sf "$BINARY_TARGET" "$BINARY_LINK"
        fi
    fi
else
    ln -sf "$BINARY_TARGET" "$BINARY_LINK"
fi

# O update-alternatives pode terminar bem e ainda assim manter um arquivo real
# onde o link deveria estar (é o que o man page manda fazer sem --force). Nesse
# caso o atalho do sistema abriria outro programa, então o postinst avisa no
# log do apt em vez de deixar o defeito invisível.
if [ "$(readlink -f "$BINARY_LINK" 2>/dev/null)" != "$BINARY_TARGET" ]; then
    echo "guardinha: aviso: $BINARY_LINK não aponta para $BINARY_TARGET; o atalho do sistema pode abrir outro programa." >&2
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true 2>/dev/null; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chown root:root '/opt/${sanitizedProductName}/chrome-sandbox' 2>/dev/null || true
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chown root:root '/opt/${sanitizedProductName}/chrome-sandbox' 2>/dev/null || true
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
# O AppArmor não tem compilação condicional por versão (não existe `if` de
# abi no perfil), então a compatibilidade se resolve por teste em vez de
# sintaxe: o perfil só é instalado quando o parser instalado o aceita.
# https://askubuntu.com/questions/1517272/writing-a-backwards-compatible-apparmor-profile
if apparmor_status --enabled >/dev/null 2>&1; then
    APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
    APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'

    # `--skip-kernel-load` é o dry run do wiki (AppArmor/HowToUse, "Dumping
    # profiles"): compila sem carregar no kernel. O `-K` deixa a compilação
    # sem tocar no cache, que pertence ao carregamento de verdade; sem ele o
    # dry run falha por causa do cache em /var/cache/apparmor e não do perfil.
    # As bandeiras `rule-not-enforced` e `rule-downgraded` são a única notícia
    # de que uma regra morreu no kernel atual (o parser ignora em silêncio o
    # que a versão não suporta), então vão para o log do apt em vez de sumirem.
    # https://wiki.debian.org/AppArmor/HowToUse#Dumping_profiles
    if ! APPARMOR_REPORT="$(apparmor_parser --skip-kernel-load -K \
        --warn=rule-not-enforced --warn=rule-downgraded \
        "$APPARMOR_PROFILE_SOURCE" 2>&1)"; then
        echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
        printf '%s\n' "$APPARMOR_REPORT" >&2
    else
        [ -z "$APPARMOR_REPORT" ] || printf '%s\n' "$APPARMOR_REPORT" >&2

        # Troca atômica: um perfil truncado no meio da escrita (disco cheio)
        # derrubaria o apparmor.service no próximo boot.
        APPARMOR_PROFILE_TMP="${APPARMOR_PROFILE_TARGET}.new"
        rm -f "$APPARMOR_PROFILE_TMP"
        if install -m 0644 -o root -g root "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TMP"; then
            mv -f "$APPARMOR_PROFILE_TMP" "$APPARMOR_PROFILE_TARGET"

            # Updating the current AppArmor profile is not possible and probably not meaningful in a chroot'ed environment.
            # Use cases are for example environments where images for clients are maintained.
            # There, AppArmor might correctly be installed, but live updating makes no sense.
            if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
                # Extra flags taken from dh_apparmor:
                # > By using '-W -T' we ensure that any abstraction updates are also pulled in.
                # https://wiki.debian.org/AppArmor/Contribute/FirstTimeProfileImport
                # São também as bandeiras que escrevem o cache do perfil, e é o
                # cache que evita recompilar a política a cada boot.
                if ! apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"; then
                    # O kernel recusou o perfil já compilado (regra que o
                    # kernel atual não aplica). Deixar o arquivo em
                    # /etc/apparmor.d faria o apparmor.service falhar no
                    # próximo boot, e o sistema perderia a política inteira por
                    # causa de um pacote: melhor ficar sem este confinamento.
                    rm -f "$APPARMOR_PROFILE_TARGET"
                    echo "guardinha: não foi possível carregar o perfil do AppArmor; o arquivo foi removido para não quebrar o apparmor.service." >&2
                fi
            fi
        else
            rm -f "$APPARMOR_PROFILE_TMP"
            echo "guardinha: não foi possível gravar $APPARMOR_PROFILE_TARGET." >&2
        fi
    fi
fi

# ---------- Cofre de dados em /var/lib (fora de ~/) ----------
# Pastas ocultas por padrão: /var/lib/.guardinha/.vault. A raiz é
# root:root 0711 sem listagem (navegar/apagar o topo exige sudo) e o vault
# fica com o usuário instalador (0700) para o app funcionar. Se o instalador
# não for identificado, o próprio app pede sudo no primeiro uso.
# O `install -d` também reajusta modo e dono de pasta já existente, então é ele
# que normaliza uma instalação antiga na atualização.
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
# Escrita por troca atômica: um XML truncado faz o polkit recusar TODAS as
# ações do arquivo, e o app perde o caminho para criar o cofre.
POLKIT_DIR='/usr/share/polkit-1/actions'
if [ -d "$POLKIT_DIR" ] && POLKIT_TMP="$(mktemp "$POLKIT_DIR/.com.guardinha.keypass.XXXXXX")"; then
    cat > "$POLKIT_TMP" <<'POLICY_EOF'
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
    chmod 0644 "$POLKIT_TMP"
    chown root:root "$POLKIT_TMP" 2>/dev/null || true
    mv -f "$POLKIT_TMP" "$POLKIT_DIR/com.guardinha.keypass.policy"
fi

# pkexec exige o dono root e sem escrita para o grupo/outros; o build pode
# ter gravado as pastas com 0775; normaliza antes de validar o helper.
install -d -m 0755 -o root -g root '/opt/${sanitizedProductName}' '/opt/${sanitizedProductName}/resources' || true
chown root:root '/opt/${sanitizedProductName}/resources/guardinha-setup' || true
chmod 0755 '/opt/${sanitizedProductName}/resources/guardinha-setup' || true
