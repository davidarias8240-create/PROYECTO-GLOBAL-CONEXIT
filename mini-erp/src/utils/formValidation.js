const phoneFields = new Set(["telefono", "celular", "numero_celular", "telefono_contacto"]);
const documentFields = new Set(["numero_documento", "documento"]);
const personNameFields = new Set(["nombres", "nombre_contacto", "apellidos"]);

export function sanitizePhone(value) {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function sanitizeDocument(value, documentType, maxLength) {
  let result = value;
  if (["CC", "TI"].includes(documentType)) result = result.replace(/\D/g, "");
  if (documentType === "NIT") result = result.replace(/[^0-9-]/g, "").replace(/-(?=.*-)/g, "");
  return result.slice(0, maxLength);
}

export function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(value);
}

export function validateDocument(value, documentType) {
  if (["CC", "TI"].includes(documentType)) return /^\d+$/.test(value);
  if (documentType === "NIT") return /^\d+(?:-\d)?$/.test(value);
  if (["CE", "PASAPORTE", "PA"].includes(documentType)) return /^[A-Za-z0-9-]+$/.test(value);
  return /^[A-Za-z0-9.-]+$/.test(value);
}

export function validateFieldValue(column, value, { entity, values, required }) {
  const field = column.name;
  const text = value === null || value === undefined ? "" : String(value);
  const trimmed = text.trim();
  if (!trimmed) return required ? "Este campo es obligatorio." : "";

  const maxLength = Number(column.columnType?.match(/^varchar\((\d+)\)/i)?.[1]);
  if (maxLength && trimmed.length > maxLength) {
    return `El máximo permitido es ${maxLength} caracteres.`;
  }
  if (field === "correo" || field === "email") {
    return validateEmail(trimmed) ? "" : "Ingresa un correo válido, por ejemplo usuario@dominio.com.";
  }
  if (phoneFields.has(field)) {
    return /^\d{10}$/.test(trimmed) ? "" : "El celular debe tener exactamente 10 dígitos.";
  }
  if (documentFields.has(field)) {
    return validateDocument(trimmed, values.tipo_documento)
      ? ""
      : "El documento contiene caracteres no permitidos para el tipo seleccionado.";
  }
  if (personNameFields.has(field)) {
    return /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(trimmed)
      ? ""
      : "Ingresa un nombre con letras, tildes y espacios; no uses números.";
  }

  if (column.enum?.length && !column.enum.includes(trimmed)) {
    return "Selecciona una opción válida.";
  }
  if (column.relation && !column.options?.some((option) => String(option.value) === trimmed)) {
    return "Selecciona un registro válido.";
  }

  if (["tinyint", "smallint", "mediumint", "int", "bigint"].includes(column.type)) {
    if (!/^-?\d+$/.test(trimmed)) return "Ingresa un número entero válido.";
    if (column.columnType?.includes("unsigned") && trimmed.startsWith("-")) {
      return "El valor no puede ser negativo.";
    }
  }

  if (["decimal", "float", "double"].includes(column.type)) {
    if (!/^\d+(?:\.\d+)?$/.test(trimmed) || !Number.isFinite(Number(trimmed))) {
      return "Ingresa un valor numérico válido, sin letras ni símbolos.";
    }
    const [, precision, scale] = column.columnType?.match(/\((\d+),(\d+)\)/) || [];
    if (precision) {
      const [integerPart, decimalPart = ""] = trimmed.split(".");
      if (integerPart.length > Number(precision) - Number(scale) || decimalPart.length > Number(scale)) {
        return "El valor supera la precisión permitida para este campo.";
      }
    }
    if (Number(trimmed) < 0) return "El valor no puede ser negativo.";
    if (field === "valor" && ["pagos", "ajustes"].includes(entity) && Number(trimmed) <= 0) {
      return "El valor debe ser mayor que cero.";
    }
  }

  if (column.type === "date" && !isValidDate(trimmed)) return "Ingresa una fecha válida.";
  if (["datetime", "timestamp"].includes(column.type) && !isValidDateTime(trimmed)) {
    return "Ingresa una fecha y hora válidas.";
  }

  return "";
}

export function validateFieldSet(columns, values, entity) {
  const errors = {};
  for (const column of columns) {
    const required = !column.nullable && column.default === null && !column.generated;
    const error = validateFieldValue(column, values[column.name], { entity, values, required });
    if (error) errors[column.name] = error;
  }

  const compareDates = (startField, endField, message) => {
    if (values[startField] && values[endField] && values[endField] < values[startField]) {
      errors[endField] = message;
    }
  };
  if (entity === "planes") compareDates("vigencia_inicio", "vigencia_fin", "La fecha final no puede ser anterior a su inicio.");
  if (entity === "contratos") compareDates("fecha_inicio", "fecha_fin", "La fecha final no puede ser anterior a su inicio.");
  if (entity === "periodos") {
    compareDates("fecha_inicio", "fecha_fin", "La fecha final no puede ser anterior a su inicio.");
    compareDates("fecha_fin", "fecha_vencimiento", "El vencimiento no puede ser anterior a la fecha final.");
  }
  if (entity === "facturas") {
    compareDates("fecha_emision", "fecha_vencimiento", "El vencimiento no puede ser anterior a la emisión.");
    if (values.saldo !== "" && values.total !== "" && Number(values.saldo) > Number(values.total)) {
      errors.saldo = "El saldo no puede superar el total de la factura.";
    }
  }
  return errors;
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function isValidDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  return Boolean(match)
    && isValidDate(`${match[1]}-${match[2]}-${match[3]}`)
    && Number(match[4]) <= 23
    && Number(match[5]) <= 59
    && Number(match[6] || 0) <= 59;
}
