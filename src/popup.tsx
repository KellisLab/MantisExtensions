import "./style.css";
import * as React from "react";
import { useEffect, useState } from "react";
import { type StoredSpace } from "./connections/types";
import { getCachedSpaces } from "./persistent";
import { searchConnections } from "./connection_manager";

function IndexPopup() {
  const [spaces, setSpaces] = useState<StoredSpace[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentConnections, setCurrentConnections] = useState([]);

  useEffect(() => {
    getCachedSpaces().then((cachedSpaces) => {
      setSpaces(cachedSpaces);
    });
  }, []);

  useEffect(() => {
    // Get current tab that is opened
    // This is used to highlight the spaces that
    // are from the same connection
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        setCurrentConnections(searchConnections(tabs[0].url).map((connection) => connection.name));
      }
    });
  }, []);

  if (!spaces) {
    return <div style={{ width: "200px", padding: "16px" }}>No spaces have been registered</div>;
  }

  let searchedSpaces = spaces;

  // Search if given a query
  if (searchQuery) {
    searchedSpaces = spaces.filter((space) => space.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  // Filter spaces by search query and group by connection parent
  const groupedSpaces = searchedSpaces.reduce((groups: Record<string, StoredSpace[]>, space) => {
    groups[space.connectionParent] = groups[space.connectionParent] || [];
    groups[space.connectionParent].push(space);
    return groups;
  }, {});

  return (
    <div className="p-4" style={{ width: "600px" }}>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>
      {Object.keys(groupedSpaces).map((connectionParent) => (
        <div
          key={connectionParent}
          /* Color it differently if the current page has this plugin activated*/
          className={`mb-6 p-4 shadow-md rounded ${currentConnections.includes(connectionParent) ? "bg-gradient-to-r from-cyan-300 to-cyan-400" : "bg-gray-50 border-gray-200"
            }`}
        >
          <h2 className="text-lg font-bold mb-2">{connectionParent}</h2>
          <ul>
            {groupedSpaces[connectionParent].map((space) => (
              <>
                <div className="group items-center bg-white p-4 rounded-xl shadow-md mb-2 transition-all duration-300 transform hover:px-8 cursor-pointer"
                  onClick={() => {
                    // Redirect current tab to the space
                    chrome.tabs.update({ url: space.url });
                  }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-[500]">{space.name}</h3>
                      <p className="text-xs text-gray-500">{space.dateCreated}</p>
                    </div>
                    <span className="text-xl text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      ❯
                    </span>
                  </div>
                </div>
              </>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default IndexPopup;