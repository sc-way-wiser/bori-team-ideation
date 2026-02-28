// components/ui/Select.jsx - Native mobile select for PWA
import React, { useState, useCallback, useMemo } from "react";
import {
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { cn } from "../../utils/cn";
import Input from "./Input";
import BottomSheet from "./BottomSheet";
import { sortBy } from "lodash";

const Select = React.forwardRef(
  (
    {
      className,
      options = [],
      value,
      defaultValue,
      placeholder = "Select an option",
      isSorting = false,
      multiple = false,
      maxMultiChoice = null,
      disabled = false,
      required = false,
      label,
      labelVariant = "default",
      description,
      error,
      searchable = false,
      clearable = false,
      loading = false,
      id,
      name,
      onChange,
      onOpenChange,
      buttonStyle,
      placeholderIcon = "chevron",
      customOptionPrefixIcon = null,
      isCustomIconRendering = false,
      isCustomTriggerButton = false,
      showBottomSheetHeader = false,
      customActionButton = null,
      bottomSheetTitle,
      bottomSheetMinHeight,
      buttonClassName,
      customContent = null,
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const selectId =
      id || `select-${Math.random()?.toString(36)?.substr(2, 9)}`;

    const sortedOptions = isSorting
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        useMemo(() => {
          return sortBy(options, [(option) => option?.label?.toLowerCase()]);
        }, [options])
      : options;

    const filteredOptions =
      searchable && searchTerm
        ? sortedOptions?.filter(
            (option) =>
              option?.label
                ?.toLowerCase()
                ?.includes(searchTerm?.toLowerCase()) ||
              (option?.value &&
                option?.value
                  ?.toString()
                  ?.toLowerCase()
                  ?.includes(searchTerm?.toLowerCase())),
          )
        : sortedOptions;

    const getSelectedDisplay = () => {
      if (!value) return placeholder;

      if (multiple) {
        const selectedOptions = sortedOptions?.filter((opt) =>
          value?.includes(opt?.value),
        );

        if (
          selectedOptions?.length === 0 &&
          Array.isArray(value) &&
          value.length > 0
        ) {
          const allOptions = options || [];
          const matchedFromAll = allOptions.filter((opt) =>
            value.includes(opt?.value),
          );

          if (matchedFromAll.length > 0) {
            if (matchedFromAll.length === 1) return matchedFromAll[0]?.label;
            if (matchedFromAll.length === 2)
              return `${matchedFromAll[0]?.label}, ${matchedFromAll[1]?.label}`;
            if (matchedFromAll.length === 3)
              return `${matchedFromAll[0]?.label}, ${matchedFromAll[1]?.label}, ${matchedFromAll[2]?.label}`;
            return `${matchedFromAll.length} selected`;
          }

          if (value.length === 1) return value[0];
          if (value.length === 2) return `${value[0]}, ${value[1]}`;
          if (value.length === 3)
            return `${value[0]}, ${value[1]}, ${value[2]}`;
          return `${value.length} selected`;
        }

        if (selectedOptions?.length === 0) return placeholder;
        if (selectedOptions?.length === 1) return selectedOptions?.[0]?.label;
        if (selectedOptions?.length === 2)
          return `${selectedOptions[0]?.label}, ${selectedOptions[1]?.label}`;
        if (selectedOptions?.length === 3)
          return `${selectedOptions[0]?.label}, ${selectedOptions[1]?.label}, ${selectedOptions[2]?.label}`;
        if (selectedOptions?.length >= 4)
          return `${selectedOptions[0]?.label}, ${selectedOptions[1]?.label}, ${selectedOptions[2]?.label} ...`;
      }

      const selectedOption = sortedOptions?.find((opt) => opt?.value === value);
      return selectedOption ? selectedOption?.label : placeholder;
    };

    const handleOptionSelect = useCallback(
      (option, shouldCloseImmediately = true) => {
        try {
          if (!option || disabled) return;
          if (!onChange || typeof onChange !== "function") return;

          if (multiple) {
            const currentValue = Array.isArray(value) ? value : [];
            const isSelected = currentValue?.includes(option?.value);
            if (isSelected) {
              onChange(currentValue?.filter((v) => v !== option?.value));
            } else {
              if (maxMultiChoice && currentValue.length >= maxMultiChoice)
                return;
              onChange([...currentValue, option?.value]);
            }
          } else {
            onChange(option?.value);
            if (shouldCloseImmediately) {
              setIsOpen(false);
              onOpenChange?.(false);
            }
          }
        } catch (err) {
          console.error("Option select error:", err);
          setIsOpen(false);
        }
      },
      [disabled, onChange, multiple, value, onOpenChange, maxMultiChoice],
    );

    const handleToggle = useCallback(() => {
      try {
        if (disabled) return;
        const newIsOpen = !isOpen;
        setIsOpen(newIsOpen);
        onOpenChange?.(newIsOpen);
        if (!newIsOpen) setSearchTerm("");
      } catch (err) {
        console.error("Toggle error:", err);
        setIsOpen(false);
      }
    }, [disabled, isOpen, onOpenChange]);

    const handleSearchChange = useCallback((e) => {
      setSearchTerm(e?.target?.value);
    }, []);

    const isSelected = (optionValue) => {
      if (multiple) return value?.includes(optionValue) || false;
      return value === optionValue;
    };

    const hasValue = multiple
      ? value?.length > 0
      : value !== undefined && value !== "" && value !== null;

    return (
      <>
        <div className="relative w-fit">
          {label && labelVariant === "consistent" && (
            <label
              htmlFor={selectId}
              className="block text-sm font-medium text-(--color-text) mb-2"
            >
              {label}
            </label>
          )}
          {label && labelVariant === "default" && (
            <label
              htmlFor={selectId}
              className={cn(
                "absolute -top-2.5 text-xs text-(--color-text-muted) transition-all duration-200 bg-(--color-surface) z-10",
                hasValue ? "opacity-100 scale-100" : "opacity-0 scale-75",
              )}
            >
              {label}
            </label>
          )}
          {isCustomTriggerButton ? (
            <button
              className={cn(className, "flex items-center gap-1")}
              onClick={handleToggle}
            >
              <span className="text-sm truncate whitespace-nowrap text-(--color-text)">
                {!hasValue ? placeholder || label : getSelectedDisplay()}
              </span>
              {placeholderIcon === "chevron" || hasValue ? (
                <CaretDownIcon className="h-5 w-5 shrink-0 text-(--color-text-muted)" />
              ) : (
                <SlidersHorizontalIcon className="h-5 w-5 shrink-0 text-(--color-text-muted)" />
              )}
            </button>
          ) : (
            <button
              ref={ref}
              id={selectId}
              type="button"
              onClick={handleToggle}
              disabled={disabled}
              className={cn(
                "h-8 flex items-center justify-between px-2 rounded text-sm",
                "bg-(--color-input) border border-(--color-border) text-(--color-text)",
                "outline-none hover:border-(--color-primary) transition-colors",
                error ? "border-red-500" : "",
                !hasValue ? "text-(--color-text-muted)" : "text-(--color-text)",
                disabled && "cursor-not-allowed opacity-50",
                className,
              )}
              {...props}
            >
              <span
                className={cn(
                  "text-sm truncate",
                  !hasValue
                    ? "text-(--color-text-muted)"
                    : "text-(--color-text)",
                )}
              >
                {!hasValue ? placeholder || label : getSelectedDisplay()}
              </span>
              {placeholderIcon === "chevron" ? (
                <CaretDownIcon className="h-4 w-4 shrink-0 text-(--color-text-muted) ml-1" />
              ) : (
                <SlidersHorizontalIcon className="h-4 w-4 shrink-0 text-(--color-text-muted) ml-1" />
              )}
            </button>
          )}
          {description && !error && (
            <p className="text-sm text-(--color-text-muted) mt-1">
              {description}
            </p>
          )}
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>

        {/* Bottom Sheet picker */}
        <BottomSheet
          isOpen={isOpen}
          onClose={handleToggle}
          onRequestClose={(closeWithAnimation) => {
            window.__bottomSheetAnimatedClose = closeWithAnimation;
          }}
          title={bottomSheetTitle || "Select"}
          showHandle={true}
          showHeader={showBottomSheetHeader}
          customActionButton={customActionButton}
          maxHeight="65vh"
          minHeight={bottomSheetMinHeight ?? "35vh"}
        >
          {searchable && (
            <div className="sticky -top-4 bg-(--color-surface) pb-3 z-10 px-4 pt-4">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--color-text-muted)" />
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  showClearButton={!!searchTerm}
                  onClear={() => setSearchTerm("")}
                  placeholder="Search..."
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>
          )}

          {customContent ? (
            customContent
          ) : (
            <div
              className={cn(
                "flex gap-2 pb-8",
                buttonStyle === "pill" ? "flex-wrap px-4 pt-4" : "flex-col",
              )}
            >
              {filteredOptions?.map((option) => {
                const selected = isSelected(option?.value);
                const currentValue = Array.isArray(value) ? value : [];
                const isMaxReached =
                  multiple &&
                  maxMultiChoice &&
                  currentValue.length >= maxMultiChoice &&
                  !selected;
                const isOptionDisabled = option?.disabled || isMaxReached;

                return buttonStyle === "pill" ? (
                  <div
                    key={option?.value}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "w-fit flex items-center px-4 py-3 h-11 rounded-full active:bg-(--color-hover) transition-colors cursor-pointer select-none bg-(--color-surface)",
                      selected && "bg-(--color-primary)",
                      isOptionDisabled && "opacity-40 cursor-not-allowed",
                    )}
                    onClick={() => {
                      if (!isOptionDisabled) handleOptionSelect(option);
                    }}
                  >
                    {isCustomIconRendering && option?.icon && (
                      <span className="shrink-0 mr-2">{option.icon}</span>
                    )}
                    {customOptionPrefixIcon && !isCustomIconRendering && (
                      <span className="shrink-0 mr-2">
                        {customOptionPrefixIcon}
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-base",
                        selected
                          ? "text-(--color-text) font-medium"
                          : "text-(--color-text-sec)",
                      )}
                    >
                      {option?.label}
                    </span>
                  </div>
                ) : (
                  <button
                    key={option?.value}
                    type="button"
                    onClick={() => {
                      if (!isOptionDisabled) {
                        if (multiple) {
                          handleOptionSelect(option, false);
                        } else {
                          onChange(option?.value);
                          requestAnimationFrame(() => {
                            if (window.__bottomSheetAnimatedClose) {
                              window.__bottomSheetAnimatedClose();
                            } else {
                              setTimeout(() => handleToggle(), 200);
                            }
                          });
                        }
                      }
                    }}
                    disabled={isOptionDisabled}
                    className={cn(
                      "w-full flex items-center justify-between px-6 py-3.5 text-left transition-colors",
                      selected
                        ? "bg-(--color-hover) text-(--color-text) font-medium"
                        : "text-(--color-text-sec) hover:bg-(--color-hover)",
                      isOptionDisabled && "opacity-40 cursor-not-allowed",
                      buttonClassName,
                    )}
                  >
                    <span
                      className={cn("text-base", selected && "font-medium")}
                    >
                      {option?.label}
                    </span>
                    {selected && (
                      <CheckIcon className="h-5 w-5 text-(--color-primary-dk) shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </BottomSheet>
      </>
    );
  },
);

Select.displayName = "Select";

export default Select;
