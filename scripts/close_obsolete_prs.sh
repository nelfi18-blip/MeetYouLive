#!/bin/bash
# Script para cerrar PRs obsoletos en MeetYouLive
# Generado automáticamente el 2026-05-07

REPO="nelfi18-blip/MeetYouLive"

echo "=============================================="
echo "LIMPIEZA DE PULL REQUESTS - MeetYouLive"
echo "=============================================="
echo ""
echo "Este script cerrará 40 PRs obsoletos (>60 días)"
echo ""
read -p "¿Continuar? (s/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]
then
    echo "Operación cancelada"
    exit 0
fi

echo ""
echo "Cerrando PRs obsoletos..."
echo ""

# Lista de PRs obsoletos (>60 días)
OBSOLETE_PRS=(11 12 14 17 22 23 24 25 26 28 29 30 31 34 39 40 42 45 47 48 66 67 69 70 71 72 73 74 75 76 77 78 80 81 82 84 85 87 88 89)

COMMENT="🧹 **Limpieza automática de PRs**

Este PR draft lleva más de 60 días sin actualizarse y probablemente ya no es relevante o fue implementado de otra manera.

**Razones para cerrar:**
- Sin actividad por más de 60 días
- Código posiblemente obsoleto o ya integrado
- Mantener el repositorio organizado y enfocado en trabajo activo

Si este trabajo aún es necesario, por favor:
1. Crear un nuevo PR actualizado contra la rama main actual
2. Incluir una descripción clara de los cambios
3. Marcar como 'ready for review' cuando esté completo

Para más detalles sobre la limpieza, ver: PR_CLEANUP_PLAN.md"

CLOSED_COUNT=0

for PR_NUM in "${OBSOLETE_PRS[@]}"
do
    echo "Cerrando PR #$PR_NUM..."
    
    if gh pr close $PR_NUM -R $REPO -c "$COMMENT" 2>/dev/null; then
        echo "  ✓ PR #$PR_NUM cerrado exitosamente"
        ((CLOSED_COUNT++))
    else
        echo "  ✗ Error cerrando PR #$PR_NUM (puede ya estar cerrado o no existir)"
    fi
    
    # Pequeña pausa para evitar rate limiting
    sleep 2
done

echo ""
echo "=============================================="
echo "✓ Limpieza completada"
echo "=============================================="
echo ""
echo "Resumen:"
echo "  - PRs cerrados: $CLOSED_COUNT / ${#OBSOLETE_PRS[@]}"
echo "  - PRs restantes: ~36 (revisar PR_CLEANUP_PLAN.md para siguientes pasos)"
echo ""
