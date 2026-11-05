// Selected Lucide paths, retrieved from api.iconify.design/lucide.json on 2026-11-05.
// ISC / Feather MIT notices: docs/licenses/lucide.txt. Game art remains the original PNG set.
const shapes={
 info:<><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></>,
 history:<><path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5m4-1v5l4 2"/></>,
 settings:<><path d="M14 17H5M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></>,
 cup:<><path d="M10 14.66V17a1 1 0 0 1-1 1a2 2 0 0 0-2 2v2m7-7.34V17a1 1 0 0 0 1 1a2 2 0 0 1 2 2v2m.916-12H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/></>,
 sound:<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298zM16 9a5 5 0 0 1 0 6m3.364 3.364a9 9 0 0 0 0-12.728"/>,
 next:<path d="m9 18l6-6l-6-6"/>,
 back:<path d="m15 18l-6-6l6-6"/>,
 close:<path d="M18 6L6 18M6 6l12 12"/>,
 members:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></>,
 plus:<path d="M5 12h14m-7-7v14"/>,
 minus:<path d="M5 12h14"/>,
 arrow:<path d="M7 7h10v10M7 17L17 7"/>,
};
export function hasUtilityIcon(name:string):name is keyof typeof shapes{return name in shapes;}
export function UtilityIcon({name,size=20}:{name:keyof typeof shapes;size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]}</svg>;}
