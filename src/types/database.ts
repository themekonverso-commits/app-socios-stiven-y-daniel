export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ajustes: {
        Row: {
          clave: string
          updated_at: string | null
          valor: Json
        }
        Insert: {
          clave: string
          updated_at?: string | null
          valor: Json
        }
        Update: {
          clave?: string
          updated_at?: string | null
          valor?: Json
        }
        Relationships: []
      }
      categorias: {
        Row: {
          created_at: string | null
          es_sistema: boolean
          id: string
          nombre: string
          orden: number | null
          tipo: string
        }
        Insert: {
          created_at?: string | null
          es_sistema?: boolean
          id?: string
          nombre: string
          orden?: number | null
          tipo: string
        }
        Update: {
          created_at?: string | null
          es_sistema?: boolean
          id?: string
          nombre?: string
          orden?: number | null
          tipo?: string
        }
        Relationships: []
      }
      cierres: {
        Row: {
          anticipos_pendientes_eur: number
          aprobaciones: Json
          base_distribuible_eur: number
          created_at: string | null
          created_by: string
          estado: string
          etiqueta: string
          gastos_eur: number
          id: string
          importe_reinversion: number
          importe_reparto_total: number
          ingresos_eur: number
          notas: string | null
          pct_reinversion: number
          pct_reparto: number
          perdidas_previas_eur: number
          periodo_fin: string
          periodo_inicio: string
          reparto_por_socio: Json
          resultado_eur: number
          updated_at: string | null
        }
        Insert: {
          anticipos_pendientes_eur?: number
          aprobaciones?: Json
          base_distribuible_eur: number
          created_at?: string | null
          created_by: string
          estado?: string
          etiqueta: string
          gastos_eur: number
          id?: string
          importe_reinversion?: number
          importe_reparto_total?: number
          ingresos_eur: number
          notas?: string | null
          pct_reinversion?: number
          pct_reparto?: number
          perdidas_previas_eur?: number
          periodo_fin: string
          periodo_inicio: string
          reparto_por_socio?: Json
          resultado_eur: number
          updated_at?: string | null
        }
        Update: {
          anticipos_pendientes_eur?: number
          aprobaciones?: Json
          base_distribuible_eur?: number
          created_at?: string | null
          created_by?: string
          estado?: string
          etiqueta?: string
          gastos_eur?: number
          id?: string
          importe_reinversion?: number
          importe_reparto_total?: number
          ingresos_eur?: number
          notas?: string | null
          pct_reinversion?: number
          pct_reparto?: number
          perdidas_previas_eur?: number
          periodo_fin?: string
          periodo_inicio?: string
          reparto_por_socio?: Json
          resultado_eur?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cierres_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierres_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
        ]
      }
      cobros_pasarela: {
        Row: {
          comisiones: number
          created_at: string | null
          created_by: string
          devoluciones: number
          fecha_cobro: string
          id: string
          importe_bruto: number
          importe_neto: number
          movimiento_comision_id: string | null
          movimiento_devolucion_id: string | null
          notas: string | null
          otros_ajustes: number
          periodo_desde: string
          periodo_hasta: string
          plataforma: string
          referencia: string | null
        }
        Insert: {
          comisiones?: number
          created_at?: string | null
          created_by?: string
          devoluciones?: number
          fecha_cobro: string
          id?: string
          importe_bruto: number
          importe_neto: number
          movimiento_comision_id?: string | null
          movimiento_devolucion_id?: string | null
          notas?: string | null
          otros_ajustes?: number
          periodo_desde: string
          periodo_hasta: string
          plataforma?: string
          referencia?: string | null
        }
        Update: {
          comisiones?: number
          created_at?: string | null
          created_by?: string
          devoluciones?: number
          fecha_cobro?: string
          id?: string
          importe_bruto?: number
          importe_neto?: number
          movimiento_comision_id?: string | null
          movimiento_devolucion_id?: string | null
          notas?: string | null
          otros_ajustes?: number
          periodo_desde?: string
          periodo_hasta?: string
          plataforma?: string
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobros_pasarela_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_comision_id_fkey"
            columns: ["movimiento_comision_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_comision_id_fkey"
            columns: ["movimiento_comision_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_comision_id_fkey"
            columns: ["movimiento_comision_id"]
            isOneToOne: false
            referencedRelation: "vw_libro_gestoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_devolucion_id_fkey"
            columns: ["movimiento_devolucion_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_devolucion_id_fkey"
            columns: ["movimiento_devolucion_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_devolucion_id_fkey"
            columns: ["movimiento_devolucion_id"]
            isOneToOne: false
            referencedRelation: "vw_libro_gestoria"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_activos: {
        Row: {
          aviso_dias: number
          categoria_gasto_id: string | null
          coste: number | null
          created_at: string | null
          created_by: string
          divisa: string | null
          email_asociado: string | null
          estado: string | null
          fecha_renovacion: string | null
          id: string
          nombre: string
          notas: string | null
          periodicidad: string | null
          tipo: string
          titular_id: string | null
          ultimo_pago: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          aviso_dias?: number
          categoria_gasto_id?: string | null
          coste?: number | null
          created_at?: string | null
          created_by?: string
          divisa?: string | null
          email_asociado?: string | null
          estado?: string | null
          fecha_renovacion?: string | null
          id?: string
          nombre: string
          notas?: string | null
          periodicidad?: string | null
          tipo: string
          titular_id?: string | null
          ultimo_pago?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          aviso_dias?: number
          categoria_gasto_id?: string | null
          coste?: number | null
          created_at?: string | null
          created_by?: string
          divisa?: string | null
          email_asociado?: string | null
          estado?: string | null
          fecha_renovacion?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          periodicidad?: string | null
          tipo?: string
          titular_id?: string | null
          ultimo_pago?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_activos_categoria_gasto_id_fkey"
            columns: ["categoria_gasto_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_activos_categoria_gasto_id_fkey"
            columns: ["categoria_gasto_id"]
            isOneToOne: false
            referencedRelation: "vw_gastos_categoria"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "cuentas_activos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_activos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "cuentas_activos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_activos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
        ]
      }
      importaciones: {
        Row: {
          created_at: string | null
          created_by: string | null
          filas_importadas: number
          filas_omitidas: number
          filas_totales: number
          id: string
          importe_total_eur: number
          nombre_archivo: string
          origen: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          filas_importadas?: number
          filas_omitidas?: number
          filas_totales?: number
          id?: string
          importe_total_eur?: number
          nombre_archivo: string
          origen?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          filas_importadas?: number
          filas_omitidas?: number
          filas_totales?: number
          id?: string
          importe_total_eur?: number
          nombre_archivo?: string
          origen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "importaciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importaciones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
        ]
      }
      integraciones: {
        Row: {
          activa: boolean | null
          config: Json | null
          created_at: string | null
          id: string
          plataforma: string
          ultima_sync: string | null
        }
        Insert: {
          activa?: boolean | null
          config?: Json | null
          created_at?: string | null
          id?: string
          plataforma: string
          ultima_sync?: string | null
        }
        Update: {
          activa?: boolean | null
          config?: Json | null
          created_at?: string | null
          id?: string
          plataforma?: string
          ultima_sync?: string | null
        }
        Relationships: []
      }
      mapeos_importacion: {
        Row: {
          config: Json
          created_at: string | null
          created_by: string | null
          id: string
          nombre: string
          origen: string | null
        }
        Insert: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          nombre: string
          origen?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          nombre?: string
          origen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mapeos_importacion_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapeos_importacion_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
        ]
      }
      movimientos: {
        Row: {
          anticipado_por: string | null
          base_eur: number
          base_imponible: number
          categoria_id: string
          clicks: number | null
          concepto: string
          created_at: string | null
          created_by: string
          divisa: string
          fecha: string
          fecha_reembolso: string | null
          id: string
          importacion_id: string | null
          impresiones: number | null
          iva_importe: number
          iva_tipo: number
          notas: string | null
          num_pedidos: number | null
          plataforma: string | null
          reembolsado: boolean
          tasa_cambio: number
          tipo: string
          total: number
          total_eur: number
          updated_at: string | null
        }
        Insert: {
          anticipado_por?: string | null
          base_eur: number
          base_imponible: number
          categoria_id: string
          clicks?: number | null
          concepto: string
          created_at?: string | null
          created_by: string
          divisa?: string
          fecha: string
          fecha_reembolso?: string | null
          id?: string
          importacion_id?: string | null
          impresiones?: number | null
          iva_importe?: number
          iva_tipo?: number
          notas?: string | null
          num_pedidos?: number | null
          plataforma?: string | null
          reembolsado?: boolean
          tasa_cambio?: number
          tipo: string
          total: number
          total_eur: number
          updated_at?: string | null
        }
        Update: {
          anticipado_por?: string | null
          base_eur?: number
          base_imponible?: number
          categoria_id?: string
          clicks?: number | null
          concepto?: string
          created_at?: string | null
          created_by?: string
          divisa?: string
          fecha?: string
          fecha_reembolso?: string | null
          id?: string
          importacion_id?: string | null
          impresiones?: number | null
          iva_importe?: number
          iva_tipo?: number
          notas?: string | null
          num_pedidos?: number | null
          plataforma?: string | null
          reembolsado?: boolean
          tasa_cambio?: number
          tipo?: string
          total?: number
          total_eur?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_anticipado_por_fkey"
            columns: ["anticipado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_anticipado_por_fkey"
            columns: ["anticipado_por"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "movimientos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "vw_gastos_categoria"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "movimientos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "movimientos_importacion_id_fkey"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "importaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      notas: {
        Row: {
          archivada: boolean
          color: string | null
          contenido: string | null
          created_at: string | null
          created_by: string
          etiquetas: string[]
          fijada: boolean | null
          id: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          archivada?: boolean
          color?: string | null
          contenido?: string | null
          created_at?: string | null
          created_by: string
          etiquetas?: string[]
          fijada?: boolean | null
          id?: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          archivada?: boolean
          color?: string | null
          contenido?: string | null
          created_at?: string | null
          created_by?: string
          etiquetas?: string[]
          fijada?: boolean | null
          id?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          color: string | null
          created_at: string | null
          email: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          color?: string | null
          created_at?: string | null
          email: string
          id: string
          nombre: string
        }
        Update: {
          activo?: boolean
          color?: string | null
          created_at?: string | null
          email?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      reembolso_movimientos: {
        Row: {
          importe_eur: number
          movimiento_id: string
          reembolso_id: string
        }
        Insert: {
          importe_eur: number
          movimiento_id: string
          reembolso_id: string
        }
        Update: {
          importe_eur?: number
          movimiento_id?: string
          reembolso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reembolso_movimientos_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolso_movimientos_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolso_movimientos_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "vw_libro_gestoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolso_movimientos_reembolso_id_fkey"
            columns: ["reembolso_id"]
            isOneToOne: false
            referencedRelation: "reembolsos"
            referencedColumns: ["id"]
          },
        ]
      }
      reembolsos: {
        Row: {
          created_at: string | null
          created_by: string
          fecha: string
          id: string
          importe_eur: number
          metodo: string | null
          notas: string | null
          socio_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          fecha: string
          id?: string
          importe_eur: number
          metodo?: string | null
          notas?: string | null
          socio_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          fecha?: string
          id?: string
          importe_eur?: number
          metodo?: string | null
          notas?: string | null
          socio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reembolsos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "reembolsos_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
        ]
      }
      tipos_cambio: {
        Row: {
          created_at: string | null
          divisa: string
          fecha: string
          id: string
          tasa_a_eur: number
        }
        Insert: {
          created_at?: string | null
          divisa: string
          fecha: string
          id?: string
          tasa_a_eur: number
        }
        Update: {
          created_at?: string | null
          divisa?: string
          fecha?: string
          id?: string
          tasa_a_eur?: number
        }
        Relationships: []
      }
    }
    Views: {
      vw_anticipos_pendientes: {
        Row: {
          categoria: string | null
          concepto: string | null
          fecha: string | null
          id: string | null
          pendiente_eur: number | null
          reembolsado_eur: number | null
          socio: string | null
          socio_color: string | null
          socio_id: string | null
          total_eur: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_anticipado_por_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_anticipado_por_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
        ]
      }
      vw_anticipos_socio: {
        Row: {
          anticipado: number | null
          anticipado_cupo: number | null
          anticipado_otros: number | null
          color: string | null
          nombre: string | null
          num_anticipos: number | null
          pendiente: number | null
          reembolsado: number | null
          socio_id: string | null
        }
        Relationships: []
      }
      vw_cobros_conciliacion: {
        Row: {
          autor_nombre: string | null
          comisiones: number | null
          created_at: string | null
          created_by: string | null
          cuadra: boolean | null
          devoluciones: number | null
          diferencia: number | null
          fecha_cobro: string | null
          id: string | null
          importe_bruto: number | null
          importe_neto: number | null
          movimiento_comision_id: string | null
          movimiento_devolucion_id: string | null
          notas: string | null
          otros_ajustes: number | null
          pct_comision: number | null
          periodo_desde: string | null
          periodo_hasta: string | null
          plataforma: string | null
          referencia: string | null
          ventas_registradas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cobros_pasarela_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_comision_id_fkey"
            columns: ["movimiento_comision_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_comision_id_fkey"
            columns: ["movimiento_comision_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_comision_id_fkey"
            columns: ["movimiento_comision_id"]
            isOneToOne: false
            referencedRelation: "vw_libro_gestoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_devolucion_id_fkey"
            columns: ["movimiento_devolucion_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_devolucion_id_fkey"
            columns: ["movimiento_devolucion_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_pasarela_movimiento_devolucion_id_fkey"
            columns: ["movimiento_devolucion_id"]
            isOneToOne: false
            referencedRelation: "vw_libro_gestoria"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_cuentas_coste: {
        Row: {
          aviso_dias: number | null
          categoria_gasto_id: string | null
          categoria_nombre: string | null
          coste: number | null
          coste_eur: number | null
          coste_mensual_eur: number | null
          created_at: string | null
          created_by: string | null
          dias_para_renovar: number | null
          divisa: string | null
          email_asociado: string | null
          estado: string | null
          fecha_renovacion: string | null
          hay_tasa: boolean | null
          id: string | null
          nombre: string | null
          notas: string | null
          periodicidad: string | null
          renueva_pronto: boolean | null
          tasa_aplicada: number | null
          tipo: string | null
          titular_color: string | null
          titular_id: string | null
          titular_nombre: string | null
          ultimo_pago: string | null
          updated_at: string | null
          url: string | null
          vencida: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_activos_categoria_gasto_id_fkey"
            columns: ["categoria_gasto_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_activos_categoria_gasto_id_fkey"
            columns: ["categoria_gasto_id"]
            isOneToOne: false
            referencedRelation: "vw_gastos_categoria"
            referencedColumns: ["categoria_id"]
          },
          {
            foreignKeyName: "cuentas_activos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_activos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
          {
            foreignKeyName: "cuentas_activos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_activos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "vw_anticipos_socio"
            referencedColumns: ["socio_id"]
          },
        ]
      }
      vw_gastos_categoria: {
        Row: {
          categoria: string | null
          categoria_id: string | null
          mes: string | null
          total: number | null
        }
        Relationships: []
      }
      vw_libro_gestoria: {
        Row: {
          anticipado_por: string | null
          base_eur: number | null
          base_imponible: number | null
          categoria: string | null
          concepto: string | null
          cuota_eur: number | null
          divisa: string | null
          fecha: string | null
          id: string | null
          iva_importe: number | null
          iva_tipo: number | null
          notas: string | null
          tasa_cambio: number | null
          tipo: string | null
          total: number | null
          total_eur: number | null
        }
        Relationships: []
      }
      vw_resumen_diario: {
        Row: {
          beneficio: number | null
          clicks: number | null
          fecha: string | null
          gasto_ads: number | null
          gastos: number | null
          impresiones: number | null
          ingresos: number | null
          pedidos: number | null
        }
        Relationships: []
      }
      vw_resumen_mensual: {
        Row: {
          beneficio: number | null
          gasto_ads: number | null
          gastos: number | null
          ingresos: number | null
          margen: number | null
          mes: string | null
          pedidos: number | null
          roas: number | null
          ticket_medio: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      es_socio_activo: { Args: never; Returns: boolean }
      fn_anular_reembolso: { Args: { p_reembolso: string }; Returns: undefined }
      fn_aprobar_cierre: { Args: { p_cierre: string }; Returns: Json }
      fn_categoria_limite: { Args: never; Returns: string }
      fn_cobro_sincronizar_gasto: {
        Args: {
          p_autor: string
          p_categoria: string
          p_concepto: string
          p_fecha: string
          p_importe: number
          p_movimiento: string
        }
        Returns: string
      }
      fn_crear_cierre: {
        Args: {
          p_etiqueta: string
          p_fin: string
          p_inicio: string
          p_notas?: string
          p_pct_reinversion?: number
        }
        Returns: string
      }
      fn_cuadre_bloque: { Args: { p_bloque: Json }; Returns: Json }
      fn_deshacer_importacion: {
        Args: { p_importacion: string }
        Returns: Json
      }
      fn_en_fase_inicial: {
        Args: { p_fecha: string; p_inicio: string; p_meses: number }
        Returns: boolean
      }
      fn_estado_liquidacion: { Args: { p_fecha_corte: string }; Returns: Json }
      fn_importacion_bloqueada: {
        Args: { p_importacion: string }
        Returns: Json
      }
      fn_importar_movimientos: {
        Args: {
          p_filas: Json
          p_filas_omitidas?: number
          p_filas_totales?: number
          p_nombre_archivo: string
          p_origen: string
        }
        Returns: Json
      }
      fn_liquidacion_calculo: { Args: { p_socios: Json }; Returns: Json }
      fn_liquidacion_final: { Args: never; Returns: Json }
      fn_marcar_reembolsado: {
        Args: { p_movimiento: string; p_reembolsado: boolean }
        Returns: undefined
      }
      fn_previsualizar_cierre: {
        Args: { p_fin: string; p_inicio: string; p_pct_reinversion?: number }
        Returns: Json
      }
      fn_prorrata_calculo: {
        Args: { p_disponible: number; p_pendientes: Json }
        Returns: Json
      }
      fn_prorrata_reembolso: { Args: { p_disponible: number }; Returns: Json }
      fn_registrar_pago_cuenta: {
        Args: {
          p_categoria?: string
          p_cuenta: string
          p_fecha?: string
          p_importe?: number
        }
        Returns: Json
      }
      fn_registrar_reembolso: {
        Args: {
          p_fecha: string
          p_importe: number
          p_lineas?: Json
          p_metodo?: string
          p_notas?: string
          p_socio_id: string
        }
        Returns: string
      }
      fn_resumen_iva: {
        Args: { p_desde: string; p_hasta: string }
        Returns: Json
      }
      fn_resumen_periodo: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          beneficio: number
          clicks: number
          gasto_ads: number
          gastos: number
          impresiones: number
          ingresos: number
          pedidos: number
        }[]
      }
      fn_retirar_aprobacion: { Args: { p_cierre: string }; Returns: Json }
      fn_saldo_banco: {
        Args: { p_fecha_corte?: string }
        Returns: {
          cobrado_bruto: number
          cobrado_neto: number
          fecha_inicial: string
          gastos_negocio: number
          pendiente_shopify: number
          reembolsos: number
          saldo_banco: number
          saldo_inicial: number
          ventas: number
        }[]
      }
      fn_ventas_registradas: {
        Args: { p_desde: string; p_hasta: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
