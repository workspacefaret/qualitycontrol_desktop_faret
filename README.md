# Quality Control Center (QCC)

Sistema desktop industrial diseñado para el monitoreo, control y análisis de calidad en procesos productivos en tiempo real.

QCC funciona como el panel administrativo y gerencial de una plataforma de control de calidad conectada a una aplicación móvil desarrollada en Flutter, utilizada directamente por operadores en planta para registrar inspecciones, métricas y reportes operacionales durante la producción.

---

# Descripción General

Quality Control Center permite visualizar, gestionar y analizar información de calidad proveniente desde líneas productivas industriales.

Los operadores registran periódicamente controles de calidad, formularios e inspecciones desde dispositivos móviles, enviando los datos directamente a la base de datos central.

Este sistema desktop consolida toda esa información para entregar:

- Paneles operacionales
- Métricas en tiempo real
- KPIs de calidad
- Formularios administrativos
- Trazabilidad
- Gestión de incidencias
- Monitoreo de producción
- Visualización estadística
- Exportación de reportes

El sistema está orientado a supervisores, jefaturas y gerencia de calidad.

---

# Arquitectura del Sistema

## Backend

- Lenguaje: C#
- Framework: .NET 8
- Arquitectura: Modular
- Patrón: Handler → Service → Repository
- Comunicación interna mediante Photino.NET
- Integración con múltiples bases de datos

## Frontend

- HTML
- CSS
- JavaScript Vanilla
- Arquitectura SPA sin frameworks
- Módulos dinámicos reutilizables
- Comunicación backend vía `window.PhotinoBridge.send()`

## Runtime

- Photino.NET
- Aplicación desktop multiplataforma
- Compatible con Windows y macOS

---

# Objetivo del Sistema

Centralizar el control operacional y administrativo de calidad industrial.

La plataforma está diseñada para:

- Supervisar procesos productivos
- Detectar desviaciones de calidad
- Registrar inspecciones
- Gestionar formularios dinámicos
- Analizar estadísticas operacionales
- Visualizar métricas en vivo
- Facilitar toma de decisiones gerenciales

---

# Integración Mobile + Desktop

## Aplicación Mobile (Flutter)

Los operadores en planta:

- Registran controles de calidad
- Reportan incidencias
- Completan formularios
- Suben datos operacionales
- Registran métricas periódicas

Toda la información es enviada en tiempo real hacia la base de datos central.

---

## Aplicación Desktop (QCC)

Los supervisores y administradores pueden:

- Monitorear información en vivo
- Revisar estadísticas
- Analizar tendencias
- Administrar formularios
- Validar registros
- Visualizar KPIs
- Gestionar trazabilidad
- Exportar reportes

---

# Estructura del Proyecto

```text
QualityControlCenter/
│
├── src/
│   ├── Backend/
│   │   ├── Config/
│   │   ├── Models/
│   │   ├── Modules/
│   │   ├── Repositories/
│   │   ├── Services/
│   │   └── Program.cs
│   │
│   └── UI/www/
│       ├── core/
│       ├── modules/
│       ├── shared/
│       └── index.html
│
├── QualityControlCenter.csproj
└── README.md

Flujo de Comunicación

El sistema utiliza un flujo desacoplado basado en mensajería interna:

Frontend
   ↓
PhotinoBridge
   ↓
MessageRouter
   ↓
Handler
   ↓
Service
   ↓
Repository
   ↓
Database

Cada módulo implementa acciones bajo la convención:
modulo.accion

Características Principales
Arquitectura modular escalable
Sistema desktop industrial
Integración mobile + desktop
Estadísticas en tiempo real
Formularios dinámicos
KPIs operacionales
Exportación Excel
Integración multi-base de datos
SPA sin frameworks
Aplicación multiplataforma
Alta velocidad de carga
Diseño reutilizable por módulos
Base de Datos

El sistema puede conectarse a:

MySQL
SQL Server
SAP Business One
Bases operacionales independientes

La configuración se gestiona mediante archivos de entorno/configuración.

Exportación de Datos
Exportación Excel mediante ClosedXML
Generación automática de reportes
Descarga local de archivos
Soporte para reportes administrativos
Instalación
Requisitos
.NET 8 SDK
Base de datos accesible
Windows o macOS


Ejecutar en Desarrollo
dotnet run

Publicar Aplicación Windows
dotnet publish -c Release -r osx-x64 --self-contained true

Principios de Desarrollo
Arquitectura desacoplada
Reutilización de módulos
Escalabilidad horizontal
Separación de responsabilidades
Frontend liviano
Minimización de dependencias
Alto rendimiento operacional
Código mantenible
Estado del Proyecto
Plataforma desktop operativa
Arquitectura modular reutilizable
Integración mobile funcional
Preparado para escalar nuevos módulos
Compatible con múltiples áreas industriales
Autor

Desarrollado por Diego Carrasco

Sistema orientado a automatización industrial, control operacional y plataformas de gestión productiva.




