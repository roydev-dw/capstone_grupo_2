export const EMPRESA_PUNTO_SABOR_ID = 1;

export function normalizeEmpresaId(valor) {
  if (valor === '' || valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null;
  }
  if (typeof valor === 'string') {
    const numero = Number(valor.trim());
    return Number.isFinite(numero) ? numero : null;
  }
  if (typeof valor === 'object') {
    return normalizeEmpresaId(
      valor?.empresa_id ??
        valor?.empresaId ??
        valor?.empresa?.id ??
        valor?.id ??
        null
    );
  }
  return null;
}

export function getEmpresaIdFromUser(user) {
  if (!user) return null;
  const candidatos = [
    user.empresa_id,
    user.empresaId,
    user.empresa?.id,
    user._raw?.empresa_id,
    user._raw?.empresaId,
    user._raw?.empresa?.id,
  ];
  for (const candidato of candidatos) {
    const normalizado = normalizeEmpresaId(candidato);
    if (normalizado != null) return normalizado;
  }
  return null;
}

export function perteneceAEmpresa(origen, permitidas = [EMPRESA_PUNTO_SABOR_ID]) {
  if (!permitidas) return true;
  const listaPermitidas = Array.isArray(permitidas) ? permitidas : [permitidas];
  const valores = listaPermitidas
    .map((valor) => normalizeEmpresaId(valor))
    .filter((valor) => valor != null);

  if (valores.length === 0) return true;

  const empresaActual =
    typeof origen === 'object' && origen !== null
      ? getEmpresaIdFromUser(origen)
      : normalizeEmpresaId(origen);
  if (empresaActual == null) return false;

  return valores.includes(empresaActual);
}
