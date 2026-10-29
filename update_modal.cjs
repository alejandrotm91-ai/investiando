const fs = require('fs');
let content = fs.readFileSync('src/components/EditHoldingsModal.tsx', 'utf-8');

// 1. Add new icons: UploadCloud, Camera, Image
content = content.replace(
  /import { X, Search, Trash2, Plus, Loader2, DollarSign, RefreshCw, ShieldAlert, Percent } from "lucide-react";/,
  'import { X, Search, Trash2, Plus, Loader2, DollarSign, RefreshCw, ShieldAlert, Percent, UploadCloud, Camera } from "lucide-react";'
);

// 2. Add interface LocalHolding
content = content.replace(
  /export default function EditHoldingsModal/,
  `interface LocalHolding extends Holding {
  inputCurrency?: string;
  originalCost?: number | "";
}

export default function EditHoldingsModal`
);

// 3. Change localHoldings to LocalHolding[]
content = content.replace(
  /const \[localHoldings, setLocalHoldings\] = useState<Holding\[\]>\(\[\]\);/,
  `const [localHoldings, setLocalHoldings] = useState<LocalHolding[]>([]);`
);

// 4. Add new states for extraction and FX rates
content = content.replace(
  /const \[cashAmount, setCashAmount\] = useState<number>\(0\);/,
  `const [cashAmount, setCashAmount] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ USD: 1 });

  // Fetch FX rates on mount
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const [eurRes, copRes] = await Promise.all([
          fetch("/api/fx?from=EUR&to=USD").then(r => r.json()),
          fetch("/api/fx?from=COP&to=USD").then(r => r.json())
        ]);
        setFxRates(prev => ({
          ...prev,
          EUR: eurRes.rate || 1.1,
          COP: copRes.rate || 0.00025
        }));
      } catch (err) {
        console.error("Error fetching FX:", err);
      }
    };
    fetchRates();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const res = await fetch("/api/portfolio/extract-from-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 })
        });
        
        if (!res.ok) throw new Error("Failed to extract");
        const data = await res.json();
        
        if (Array.isArray(data)) {
          const newHoldings: LocalHolding[] = data.map((item: any) => ({
            ticker: item.ticker.toUpperCase(),
            shares: Number(item.shares) || 1,
            avgCost: 0,
            originalCost: "",
            inputCurrency: "USD",
            isMargin: false
          }));
          
          setLocalHoldings(prev => [...prev, ...newHoldings]);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert(language === "EN" ? "Failed to extract portfolio from image." : "Error al extraer el portafolio de la imagen.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };`
);

// 5. Update the localHoldings initialization in useEffect
content = content.replace(
  /const stocksCopy: Holding\[\] = JSON.parse\(JSON.stringify\(stocksOnly\)\);/,
  `const stocksCopy: LocalHolding[] = JSON.parse(JSON.stringify(stocksOnly)).map((h: any) => ({
      ...h,
      inputCurrency: "USD",
      originalCost: h.avgCost || 0
    }));`
);

// 6. Update handleUpdateField to handle originalCost and currency
content = content.replace(
  /const handleUpdateField = \(index: number, field: keyof Holding, value: any\) => \{[\s\S]*?\}\);\n  \};/,
  `const handleUpdateField = (index: number, field: keyof LocalHolding, value: any) => {
    setLocalHoldings((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      
      // If we are updating originalCost or inputCurrency, recalculate avgCost
      if (field === "originalCost" || field === "inputCurrency") {
        const item = copy[index];
        const cost = Number(item.originalCost) || 0;
        const currency = item.inputCurrency || "USD";
        const rate = fxRates[currency] || 1;
        item.avgCost = cost * rate;
      }
      
      return copy;
    });
  };`
);

// 7. Update handleSaveAndSubmit to just map correctly
content = content.replace(
  /const finalHoldings: Holding\[\] = \[\n\s*\.\.\.localHoldings\.map\(\(h\) => \(\{\n\s*ticker: h\.ticker\.toUpperCase\(\),\n\s*shares: Number\(h\.shares\) \|\| 0,\n\s*avgCost: Number\(h\.avgCost\) \|\| 0,\n\s*isMargin: Boolean\(h\.isMargin\),\n\s*\}\)\),\n\s*\];/,
  `const finalHoldings: Holding[] = [
      ...localHoldings.map((h) => ({
        ticker: h.ticker.toUpperCase(),
        shares: Number(h.shares) || 0,
        avgCost: Number(h.avgCost) || 0,
        isMargin: Boolean(h.isMargin),
      })),
    ];`
);

fs.writeFileSync('src/components/EditHoldingsModal.tsx', content);
