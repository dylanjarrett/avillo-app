// AvilloOS Email Inbox List
export default function EmailInbox() {
  const emails = [
    { subject: "New Inquiry", snippet: "Client is requesting more info..." },
    { subject: "Offer Update", snippet: "Your offer has been received..." },
  ];

  return (
    <div className="space-y-3">
      {emails.map((e, idx) => (
        <div key={idx} className="p-4 bg-input border border-border rounded-lg text-foreground">
          <h4 className="font-semibold">{e.subject}</h4>
          <p className="text-muted-foreground text-sm">{e.snippet}</p>
        </div>
      ))}
    </div>
  );
}
