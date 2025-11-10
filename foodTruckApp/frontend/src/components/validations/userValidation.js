import * as yup from 'yup';

export const userSchema = yup.object({
  nombre_completo: yup
    .string()
    .required('El nombre completo es obligatorio')
    .min(3, 'Debe tener al menos 3 caracteres'),
  email: yup
    .string()
    .email('Correo electrónico inválido')
    .required('El correo es obligatorio')
    .matches(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'El correo debe tener un formato válido (ej: usuario@dominio.cl)'),
  password: yup
    .string()
    .required('La contraseña es obligatoria')
    .min(8, 'Mínimo 8 caracteres')
    .matches(/[A-Z]/, 'Debe tener una mayúscula')
    .matches(/[a-z]/, 'Debe tener una minúscula')
    .matches(/\d/, 'Debe tener un número')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/, 'Debe tener al menos un símbolo especial'),
  telefono: yup
    .string()
    .required('El teléfono es obligatorio')
    .matches(/^\+56\s?9\d{8}$/, 'Debe tener formato +56 9 XXXX XXXX'),
  empresa_id: yup.number().typeError('Selecciona una empresa válida').required('Selecciona una empresa'),
  sucursal_id: yup.number().typeError('Selecciona una sucursal válida').required('Selecciona una sucursal'),
  rol_id: yup.number().typeError('Selecciona un rol válido').required('Selecciona un rol'),
  estado: yup.boolean().default(true),
});
