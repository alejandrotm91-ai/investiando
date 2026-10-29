const fs = require('fs');
const content = fs.readFileSync('src/components/WelcomePlatformModal.tsx', 'utf-8');

// Replace imports
let newContent = content.replace(/import\s*\{\s*ResponsiveContainer[\s\S]*?from\s*"recharts";\s*/g, '');
newContent = newContent.replace(/ChevronLeft,\s*/, '');
newContent = newContent.replace(/Activity\s*/, '');

// Remove states
newContent = newContent.replace(/const \[step, setStep\] = useState<"welcome" \| "compounding">.*?\n/, '');
newContent = newContent.replace(/const \[scaleType, setScaleType\] = useState<"log" \| "linear">.*?\n/, '');

// Remove useEffect for step
newContent = newContent.replace(/useEffect\(\(\) => \{\n\s*if \(isOpen\) \{\n\s*setStep\("welcome"\);\n\s*\}\n\s*\}, \[isOpen\]\);\n/, '');

// Remove chart data and tooltip (everything from const compoundingData to return null; };)
newContent = newContent.replace(/\s*\/\/ Compounding historical data points[\s\S]*?return null;\n\s*};\n/g, '\n');

// Replace step 1 wrapper
newContent = newContent.replace(/\{\s*step === "welcome" && \(\n\s*(<div\s*id="welcome-platform-modal-card"[\s\S]*?)\n\s*\{?\/\* CTA BUTTON: THE POWER OF COMPOUNDING \*\/\}?/, '$1\n          {/* CTA BUTTON */}');

// Replace the CTA Button and everything after it
newContent = newContent.replace(/\{\/\* CTA BUTTON \*\/\}[\s\S]*/, `{/* CTA BUTTON */}
          <button
            id="welcome-platform-continue-btn"
            type="button"
            onClick={onContinue}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-mono font-black text-sm text-center shadow-lg shadow-emerald-950/60 transition-all hover:scale-[1.005] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 mt-1"
          >
            <span>{isES ? "Entendido, Continuar al Aviso Legal" : "Understood, Continue to disclaimer"}</span>
            <ArrowRight size={16} className="stroke-[2.5]" />
          </button>
        </div>
    </div>
  );
}
`);

fs.writeFileSync('src/components/WelcomePlatformModal.tsx', newContent);
