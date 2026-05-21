
import React, { useState } from 'react';
import { UserProfile, SubscriptionTier } from '../types';
import { ICONS } from '../constants';
import { ArrowRight } from 'lucide-react';

interface ProGateProps {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  onBack: () => void;
}


const ProGate: React.FC<ProGateProps> = ({ profile, setProfile, onBack }) => {
  const [loading, setLoading] = useState<string | null>(null);

  const upgrade = (tier: SubscriptionTier) => {
    setLoading(tier);
    setTimeout(() => {
      setProfile({ ...profile, tier, isPro: tier !== 'free' });
      setLoading(null);
      onBack();
    }, 1500);
  };

  const plans = [
    {
      id: 'free' as SubscriptionTier,
      name: 'Explorer',
      price: '$0',
      description: 'The essentials for every student.',
      features: ['2 Course Hubs', 'AI Summaries', 'Standard Schedule'],
      isSelected: profile.tier === 'free'
    },
    {
      id: 'scholar' as SubscriptionTier,
      name: 'Elite Scholar',
      price: '$29',
      description: 'Elevate your performance.',
      features: ['Unlimited Course Hubs', 'Priority AI Access', 'Advanced Exam Mode', 'Shared Study Circles'],
      isSelected: profile.tier === 'scholar'
    },
    {
      id: 'sage' as SubscriptionTier,
      name: 'Academic Sage',
      price: '$59',
      description: 'The ultimate academic advantage.',
      features: ['AI Seminar Podcasts🎙️', 'Study Circles', 'Everything in Elite'],
      isSelected: profile.tier === 'sage'
    }
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-tight leading-none">Pricing</h1>
        <p className="text-slate-500 font-medium text-sm italic mt-1 max-w-lg mx-auto">Start your study journey with our plan. Special pricing just for you.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-6">
        {plans.map((plan, idx) => (
          <div key={idx} className={`bg-white p-6 rounded-[2rem] border flex flex-col justify-between transition-all hover:shadow-xl group hover:-translate-y-1 ${plan.isSelected ? 'border-blue-600 ring-4 ring-blue-50 bg-blue-50/5' : 'border-slate-100 shadow-sm'}`}>
             <div className="space-y-8">
                <div className="space-y-2">
                   <h3 className="text-3xl font-bold text-slate-900 tracking-tighter">{plan.price}</h3>
                   <div className="space-y-0.5">
                      <h4 className="text-base font-serif font-bold text-slate-900 leading-none">{plan.name}</h4>
                      <p className="text-slate-500 text-[10px] font-medium italic pr-4">{plan.description}</p>
                   </div>
                </div>

                <div className="space-y-4">
                   {plan.features.map((feature, fIdx) => (
                      <div key={fIdx} className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-slate-600">
                         <div className="w-5 h-5 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors">
                            {ICONS.CheckCircle}
                         </div>
                         <span className="opacity-80 leading-relaxed">{feature}</span>
                      </div>
                   ))}
                </div>
             </div>

             <button 
               onClick={() => !plan.isSelected && upgrade(plan.id)}
               disabled={loading !== null || plan.isSelected}
               className={`mt-10 w-full py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${
                 plan.isSelected 
                   ? 'bg-slate-50 text-slate-400 cursor-default border border-slate-100' 
                   : 'bg-slate-900 text-white hover:bg-black shadow-lg hover:shadow-slate-400 active:scale-95'
               }`}
             >
               {loading === plan.id ? 'Loading...' : plan.isSelected ? 'Selected' : 'Choose Plan'}
             </button>
          </div>
        ))}
      </div>

      <div className="text-center pt-8">
         <button onClick={onBack} className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors transition-underline">
            Back to Dashboard
         </button>
      </div>
    </div>
  );
};


export default ProGate;
