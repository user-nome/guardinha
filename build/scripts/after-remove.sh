#!/bin/bash

# Padrão do electron-builder (templates/linux/after-remove.tpl) + remoção do
# perfil do AppArmor e da ação do PolicyKit criada no postinst. Os dados do
# cofre (/var/lib) permanecem.
#
# O dpkg chama este script como postrm com uma ação em $1: "remove" na
# desinstalação, "purge" depois dela, "disappear" quando os arquivos do pacote
# já não estão lá, e "upgrade" quando a versão antiga está saindo para a nova
# entrar. As três primeiras desmontam; "upgrade" não: durante a atualização,
# tirar o perfil deixaria o app sem confinamento até o postinst novo
# recarregá-lo, e apagar a ação do PolicyKit no meio do caminho pode deixar o
# app sem como criar o cofre se o postinst falhar. Sem argumento (script
# chamado à mão), trata como remoção.
# shellcheck disable=SC2016

case "${1:-remove}" in
    remove | purge | disappear) ;;
    *)
        exit 0
        ;;
esac

# ${executable} e ${sanitizedProductName} são placeholders do electron-builder:
# o build os substitui antes de o dpkg rodar este script, então as aspas simples
# são proposital (o shell não deve expandir).

# Delete the link to the binary
# update-alternatives --remove <name> <path>: 'path' must be the registered alternative binary,
# not the generic symlink; see https://manpages.ubuntu.com/manpages/noble/man1/update-alternatives.1.html
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

# Se a instalação caiu no caminho de link direto (sem update-alternatives), o
# --remove acima não conhece a ligação e ela fica apontando para um /opt que o
# dpkg acabou de apagar. Remove só o symlink que resolve para dentro da nossa
# árvore: um /usr/bin/${executable} de outro pacote não é tocado.
if [ -L '/usr/bin/${executable}' ]; then
    case "$(readlink -f '/usr/bin/${executable}' 2>/dev/null)" in
        '/opt/${sanitizedProductName}/'*)
            rm -f '/usr/bin/${executable}'
            ;;
    esac
fi

APPARMOR_PROFILE_DEST='/etc/apparmor.d/${executable}'

# Remove and unload apparmor profile.
if [ -f "$APPARMOR_PROFILE_DEST" ]; then
    # Unload the profile from the running kernel before deleting the file so the
    # policy is not left enforced until the next reboot.  Mirror the chroot guard
    # used in the after-install script; live AppArmor operations are not
    # meaningful inside a chroot.
    # https://apparmor.net/man/4.0/apparmor_parser/#COMMANDS
    if apparmor_status --enabled >/dev/null 2>&1; then
        if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
            apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true
        fi
    fi
    rm -f "$APPARMOR_PROFILE_DEST"
fi

# Um postinst interrompido pode deixar o temporário da troca atômica para trás.
rm -f "${APPARMOR_PROFILE_DEST}.new"

# A ação do PolicyKit é criada pelo postinst (fora do banco do dpkg): remove aqui.
rm -f '/usr/share/polkit-1/actions/com.guardinha.keypass.policy'
