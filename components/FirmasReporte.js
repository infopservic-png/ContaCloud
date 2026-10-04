export default function FirmasReporte() {
  const firmantes = ["Elaborado por (Contador)", "Representante Legal", "Auditor"];
  return (
    <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8">
      {firmantes.map((f) => (
        <div key={f} className="text-center">
          <div className="border-t border-ink pt-2 mx-4">
            <p className="text-sm">{f}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
